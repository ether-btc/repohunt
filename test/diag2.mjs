// ISOLATE the trigger: is it the regex, or parseRetryAfter's x-ratelimit-reset fallback?
import { searchRepos, RateLimitError, GitHubError } from "../dist/github.js";

function fakeRes(body, init = {}) {
  const status = init.status ?? 200;
  return { status, ok: status >= 200 && status < 300,
    statusText: `Status ${status}`, headers: new Headers(init.headers ?? {}),
    json: async () => body };
}
const future = String(Math.floor(Date.now() / 1000) + 3600);
const body = { message: "Resource not accessible by integration" };

// B1: 403 auth-denial, NO rate-limit headers at all (GitHub often omits on rejected reqs)
const B1 = fakeRes(body, { status: 403, headers: {} });
// B2: 403 auth-denial, WITH x-ratelimit-reset in future (authenticated token, window not exhausted)
const B2 = fakeRes(body, { status: 403, headers: {
  "x-ratelimit-limit":"5000","x-ratelimit-remaining":"4999","x-ratelimit-reset":future } });

async function run(label, res) {
  const before = process.env.GITHUB_TOKEN; process.env.GITHUB_TOKEN = "test-token";
  try { await searchRepos("x", {}, async () => res); console.log(`${label}: NO ERROR`); }
  catch (e) {
    const kind = e instanceof RateLimitError ? "RateLimitError" :
                 e instanceof GitHubError ? `GitHubError(${e.status})` : e.constructor.name;
    console.log(`${label}: ${kind}`);
  }
  if (before === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = before;
}
console.log("=== B1: 403, no rate-limit headers (true auth-denial) ==="); await run("B1", B1);
console.log("=== B2: 403, with x-ratelimit-reset in future ==="); await run("B2", B2);
