// DIAGNOSTIC: what message does the code see, and does the regex match it?
import { searchRepos, RateLimitError, GitHubError } from "../dist/github.js";

function fakeRes(body, init = {}) {
  const status = init.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: `Status ${status}`,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
  };
}
const future = String(Math.floor(Date.now() / 1000) + 3600);

// Shape B: realistic 403 auth-denial (what a fine-grained PAT w/ no scope gets)
const bodyB = { message: "Resource not accessible by integration" };
const B = fakeRes(bodyB, { status: 403,
  headers: { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4999", "x-ratelimit-reset": future } });

// Also directly test the regex (no server) on the exact strings:
const regex = /rate limit|secondary|abuse/i;
const samples = [
  "Resource not accessible by integration",
  "Resource not accessible by integration", // same
  "API rate limit exceeded",
  "You have exceeded a secondary rate limit",
  "abuse detection mechanism",
];
console.log("=== regex direct test ===");
for (const s of samples) console.log(JSON.stringify(s), "->", regex.test(s));

console.log("=== real code path, Shape B ===");
const before = process.env.GITHUB_TOKEN;
process.env.GITHUB_TOKEN = "test-token";
try {
  await searchRepos("anything", {}, async () => B);
  console.log("B: NO ERROR");
} catch (e) {
  const kind = e instanceof RateLimitError ? "RateLimitError" :
               e instanceof GitHubError ? `GitHubError(${e.status})` : e.constructor.name;
  console.log("B:", kind, "| name:", e.name);
}
if (before === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = before;
