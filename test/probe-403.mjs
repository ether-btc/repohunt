// RUNTIME PROBE (audit R2 skill rule: verify suspected bug with a probe).
// Reproduces the exact shape GitHub returns for a 403 AUTH/SCOPE denial:
//   403 Forbidden  +  x-ratelimit-remaining:0  +  x-ratelimit-reset:<future>
//   (NO literal `retry-after` header — that's the key distinction).
// Bug claim: parseRetryAfter() falls back to x-ratelimit-reset, so
// github.ts:159 `retryAfter !== undefined` is TRUE → auth denial misclassified
// as RateLimitError → caller told "GitHub rate limit" (unretryable masked).
// We import the BUILT dist (same artifact Hermes would load) and assert the
// CORRECT classification (GitHubError, status 403). A thrown RateLimitError
// proves the bug.
import { searchRepos, RateLimitError, GitHubError } from "../dist/github.js";

// Build a 403 response with rate-limit headers but no retry-after.
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
const deniedFetch = async () =>
  fakeRes({ message: "Resource not accessible by integration" }, {
    status: 403,
    headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": future },
  });

process.env.GITHUB_TOKEN = "test-token";

try {
  await searchRepos("anything", {}, deniedFetch);
  console.log("PROBE_RESULT: no error thrown (unexpected)");
} catch (e) {
  const kind = e instanceof RateLimitError ? "RateLimitError" :
               e instanceof GitHubError ? `GitHubError(403)` : e.constructor.name;
  console.log("PROBE_RESULT: caught", kind);
  console.log("BUG_CONFIRMED:", e instanceof RateLimitError ? "YES (auth denial misreported as rate limit)" : "NO (correctly classified)");
}
