// FAITHFUL probes for the 403 auth-denial classification question.
// Two realistic 403 shapes vs the CURRENT code and the reviewer's FIXED code.
// We import from dist (the artifact Hermes would load).
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

// SHAPE A — UNFAITHFUL (what my first probe used): rate limit ALSO exhausted.
const A = fakeRes({ message: "Resource not accessible by integration" }, {
  status: 403,
  headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": future },
});
// SHAPE B — FAITHFUL auth-denial: authenticated quota intact, NO retry-after.
const B = fakeRes({ message: "Resource not accessible by integration" }, {
  status: 403,
  headers: { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4999", "x-ratelimit-reset": future, "x-ratelimit-used": "1" },
});
// SHAPE C — FAITHFUL secondary-rate-limit 403: remaining 0 + Retry-After header.
const C = fakeRes({ message: "You have exceeded a secondary rate limit" }, {
  status: 403,
  headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": future, "retry-after": "60" },
});

async function classify(label, fetchImpl) {
  const before = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "test-token";
  try {
    await searchRepos("anything", {}, fetchImpl);
    console.log(`${label}: NO ERROR (unexpected)`);
  } catch (e) {
    const kind = e instanceof RateLimitError ? "RateLimitError" :
                 e instanceof GitHubError ? `GitHubError(${e.status})` : e.constructor.name;
    console.log(`${label}: ${kind}`);
  }
  if (before === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = before;
}

console.log("--- CURRENT CODE ---");
await classify("A unfaithful(remaining=0)", async () => A);
await classify("B faithful-auth-denial", async () => B);
await classify("C faithful-rate-limit", async () => C);
