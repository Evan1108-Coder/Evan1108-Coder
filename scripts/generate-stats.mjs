import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const owner = process.env.GITHUB_REPOSITORY_OWNER || "Evan1108-Coder";
const token = process.env.GITHUB_TOKEN || getGhToken();

if (!token) {
  throw new Error("GITHUB_TOKEN is required. Locally, authenticate with `gh auth login`.");
}

const query = `
query($login:String!) {
  user(login:$login) {
    repositories(first:100, ownerAffiliations:OWNER, privacy:PUBLIC, orderBy:{field:UPDATED_AT,direction:DESC}) {
      nodes {
        name
        isFork
        stargazerCount
        languages(first:10, orderBy:{field:SIZE,direction:DESC}) {
          edges {
            size
            node { name color }
          }
        }
        defaultBranchRef {
          target {
            ... on Commit { history { totalCount } }
          }
        }
        pullRequests { totalCount }
        issues { totalCount }
      }
    }
  }
}`;

const data = await graphql(query, { login: owner });
const repos = data.user.repositories.nodes.filter((repo) => !repo.isFork);
const projectRepos = repos.filter((repo) => repo.name !== owner);

const totals = {
  stars: repos.reduce((sum, repo) => sum + (repo.stargazerCount || 0), 0),
  commits: projectRepos.reduce(
    (sum, repo) => sum + (repo.defaultBranchRef?.target?.history?.totalCount || 0),
    0,
  ),
  prs: repos.reduce((sum, repo) => sum + (repo.pullRequests?.totalCount || 0), 0),
  issues: repos.reduce((sum, repo) => sum + (repo.issues?.totalCount || 0), 0),
};

const languages = new Map();
for (const repo of projectRepos) {
  for (const edge of repo.languages.edges) {
    const current = languages.get(edge.node.name) || {
      name: edge.node.name,
      color: edge.node.color || "#858585",
      size: 0,
    };
    current.size += edge.size;
    languages.set(edge.node.name, current);
  }
}

const topLanguages = [...languages.values()]
  .sort((a, b) => b.size - a.size)
  .slice(0, 6);
const languageTotal = topLanguages.reduce((sum, language) => sum + language.size, 0);

mkdirSync("assets", { recursive: true });
writeFileSync("assets/github-stats-v2.svg", renderStatsCard(totals), "utf8");
writeFileSync("assets/top-languages.svg", renderLanguagesCard(topLanguages, languageTotal), "utf8");

function getGhToken() {
  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function graphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(`GitHub GraphQL errors: ${JSON.stringify(body.errors)}`);
  }
  return body.data;
}

function renderStatsCard({ stars, commits, prs, issues }) {
  return `<svg width="470" height="195" viewBox="0 0 470 195" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Evan's GitHub Stats</title>
  <desc id="desc">A compact GitHub stats card for ${escapeXml(owner)}.</desc>
  <style>
    .card { fill: #0d1117; }
    .title { fill: #1f6feb; font: 700 24px Arial, sans-serif; }
    .label { fill: #4b9aaa; font: 700 17px Arial, sans-serif; }
    .value { fill: #5bbad0; font: 700 17px Arial, sans-serif; }
    .icon-bg { fill: #0f2f5f; stroke: #22a7f2; stroke-width: 1.5; }
    .icon-text { fill: #22a7f2; font: 700 14px Arial, sans-serif; text-anchor: middle; dominant-baseline: central; }
    .ring-bg { stroke: #0f2f5f; stroke-width: 11; fill: none; }
    .ring { stroke: #1f6feb; stroke-width: 11; fill: none; stroke-linecap: round; stroke-dasharray: 223 63; transform: rotate(-90deg); transform-origin: 355px 101px; }
    .grade { fill: #5bbad0; font: 700 30px Arial, sans-serif; }
  </style>
  <rect class="card" width="470" height="195" rx="10"/>
  <text class="title" x="28" y="42">Evan's GitHub Stats</text>

  ${statRow(73, "★", "Total Stars Earned:", stars)}
  ${statRow(103, "C", "Total Commits:", commits)}
  ${statRow(133, "PR", "Total PRs:", prs)}
  ${statRow(163, "!", "Total Issues:", issues)}

  <circle class="ring-bg" cx="355" cy="101" r="46"/>
  <circle class="ring" cx="355" cy="101" r="46"/>
  <text class="grade" x="333" y="111">A</text>
</svg>
`;
}

function statRow(y, icon, label, value) {
  return `<rect class="icon-bg" x="24" y="${y}" width="24" height="24" rx="6"/>
  <text class="icon-text" x="36" y="${y + 12}">${escapeXml(icon)}</text>
  <text class="label" x="58" y="${y + 15}">${escapeXml(label)}</text>
  <text class="value" x="245" y="${y + 15}">${formatNumber(value)}</text>`;
}

function renderLanguagesCard(languages, total) {
  const barX = 28;
  const barWidth = 414;
  let offset = barX;
  const segments = languages
    .map((language, index) => {
      const width = total ? (language.size / total) * barWidth : 0;
      const segment = `<rect x="${offset.toFixed(1)}" y="68" width="${width.toFixed(1)}" height="11"${index === 0 ? ' rx="5.5"' : ""} fill="${escapeXml(language.color)}"/>`;
      offset += width;
      return segment;
    })
    .join("\n  ");

  const rows = languages
    .map((language, index) => {
      const x = index % 2 === 0 ? 38 : 258;
      const y = 112 + Math.floor(index / 2) * 33;
      const textX = x + 16;
      const percent = total ? ((language.size / total) * 100).toFixed(2) : "0.00";
      return `<circle cx="${x}" cy="${y}" r="7" fill="${escapeXml(language.color)}"/>
  <text class="text" x="${textX}" y="${y + 6}">${escapeXml(language.name)} ${percent}%</text>`;
    })
    .join("\n\n  ");

  return `<svg width="470" height="195" viewBox="0 0 470 195" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Evan's Most Used Languages</title>
  <desc id="desc">A compact most-used-languages card for ${escapeXml(owner)} public repositories.</desc>
  <style>
    .card { fill: #0d1117; }
    .title { fill: #1f6feb; font: 700 24px Arial, sans-serif; }
    .text { fill: #4b9aaa; font: 500 17px Arial, sans-serif; }
    .bar-bg { fill: #30363d; }
  </style>
  <rect class="card" width="470" height="195" rx="10"/>
  <text class="title" x="28" y="42">Evan's Most Used Languages</text>

  <rect class="bar-bg" x="28" y="68" width="414" height="11" rx="5.5"/>
  ${segments}

  ${rows}
</svg>
`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
