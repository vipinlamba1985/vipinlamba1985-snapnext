# SnapNext Launch Readiness — QA Report

Reviewed against `main` at `2c5b49d` on 9 August 2026, using a fresh clone,
`npm ci`, a full production build, and both the custom and standalone production
servers. Every finding below was reproduced locally; none are inferred from
documentation alone.

## Gate results after the fixes in this branch

| Gate | Before | After |
| --- | --- | --- |
| `npm test` | 509 / 509 | **519 / 519** (10 new origin regression tests) |
| `npx eslint .` | 1 error, 138 warnings — **CI red** | **0 errors**, 138 warnings — exit 0 |
| `npm run typecheck` | clean | clean |
| `npx next build` | pass | pass |
| `npm run test:smoke` | 3 failures (2 with `CORS_ORIGINS` set) | **2 failures** — the known P1s below, with no `CORS_ORIGINS` needed |
| `npm audit --omit=dev` | 1 critical, 6 high; `next` directly vulnerable | 1 critical, 6 high; **`next` no longer directly vulnerable** |

The smoke run above was executed against `.next/standalone/server.js` with static
assets in place and `CORS_ORIGINS` unset — the "Oversized API write is rejected
early" check now passes on its own, which is the direct proof of the origin fix.

## Gate results (before the fixes in this branch)

| Gate | Command | Result | Detail |
| --- | --- | --- | --- |
| Unit & policy tests | `npm test` | PASS | 509 / 509 |
| TypeScript | `npm run typecheck` | PASS | clean, exit 0 |
| Production build | `npx next build` | PASS | standalone output, all routes compiled |
| ESLint | `npx eslint .` | **FAIL** | 1 error, 138 warnings — the red CI gate |
| Smoke (local prod server) | `npm run test:smoke` | **FAIL** | 2 checks; a 3rd without `CORS_ORIGINS` |
| Dependency audit | `npm audit --omit=dev` | **FAIL** | 31 vulns — 1 critical, 6 high |
| Android policy | `npm run policy:android` | n/a locally | needs `native:bootstrap:android` first — runs and passes in CI, see below |
| iOS policy | `npm run policy:ios` | n/a locally | needs `native:bootstrap:ios` first — runs and passes in CI, see below |

## P0 — fixed in this branch

### 1. Same-origin browser writes rejected with `403 origin_not_allowed`

Middleware built its allow-list from `request.nextUrl.origin`. On a self-hosted
Node server that resolves to a literal `http://localhost:<port>`, ignoring both
the real `Host` header and `x-forwarded-proto`. A browser on the real domain
sends that domain as its `Origin`, which never matches — so login, signup,
upload and checkout all failed before reaching a route handler. Browsers send
`Origin` on every non-GET request, so this affected all writes.

Isolated by brute-forcing which origin value passed, against
`.next/standalone/server.js` — the entrypoint the `Dockerfile` runs:

```
# server listening on :3200, CORS_ORIGINS unset
Origin: https://snapnext.ai    Host: snapnext.ai    403
Origin: http://example.com     Host: example.com    403
Origin: http://127.0.0.1:3200  Host: 127.0.0.1      403
Origin: http://localhost:3000                       403
Origin: http://localhost:3200                       503  <- the only accepted value
(no Origin header)                                  503
```

**Scope.** Confirmed on the self-hosted/Docker path. Production appears to be
Vercel, where middleware runs in the Edge runtime and `nextUrl` is built from the
full request URL — so this may have been latent rather than live there. It could
not be confirmed against the deployment from the review environment.

**Fix.** Origin resolution moved to `lib/request-origin.js` as a pure function
and derived from `x-forwarded-host` / `x-forwarded-proto`, falling back to `Host`
and then the server's own scheme. `CORS_ORIGINS` remains additive, for extra
origins only, and is now documented in `docs/ENV_REQUIRED.md`, `.env.example` and
`.env.docker.example` — it previously appeared in none of them.
`tests/request-origin.test.mjs` covers the regression.

### 2. `next@15.5.16` middleware-bypass advisory

Seven advisories affect this version. The relevant one is
[GHSA-26hh-7cqf-hhc6](https://github.com/advisories/GHSA-26hh-7cqf-hhc6), a
Middleware / Proxy bypass in App Router applications, fixed in 15.5.18. Middleware
is both the auth gate for protected routes and the rate limiter that caps AI
spend, so a bypass has two blast radii. Also present: SSRF in rewrites and in
Server Actions on custom servers, and DoS in Server Actions.

**Fix.** Pinned to `next@15.5.23`. Not a major bump.

After the bump `next` no longer carries any advisory of its own — it still appears
in `npm audit` output, but only transitively via the `postcss` and `sharp` copies
it bundles (`via: ['postcss', 'sharp']`, no direct entries). npm's remaining
suggested fix is `next@16.3.0`, a major upgrade, which is deliberately out of
scope for a launch-blocker change.

### 3. CI red on `main` since 6 August

The Quality Visibility workflow treats ESLint *errors* as a required gate. One
error failed it — `components/protection/useDiscoveryFlow.js:72`, a
`react-hooks/refs` violation from reading `registryRef.current` during render.
The remaining 138 findings are warnings and do not fail the build.

**Fix.** Switched to the init-once form the rule expects,
`if (registryRef.current == null)`.

## P1 — not fixed here, needs a decision

| Issue | Detail |
| --- | --- |
| **No service worker — open decision, do not default to building one** | `/sw.js` returns 404 and there is no `navigator.serviceWorker` registration. The manifest is valid and installable. `docs/MOBILE_LAUNCH_QA.md` requires "offline state is understandable and queued actions recover when online", so the smoke check fails. **The right response is probably to change the requirement, not to write a service worker.** SnapNext is an online media/storage product; a poorly-scoped service worker introduces stale UI, cached-authentication bugs and upload confusion — strictly worse than having none. If offline web support is not a launch promise, amend `MOBILE_LAUNCH_QA.md` and drop the smoke check. This is an explicit product decision and has deliberately not been made here. |
| **Content-Security-Policy — now report-only** | CSP was absent. It is now shipped as `Content-Security-Policy-Report-Only`, deliberately not enforced: SnapNext loads Stripe, Supabase, the Google/Dropbox/OneDrive pickers and presigned S3 media, and an enforced policy that misses one host breaks a real user flow silently. **Next step: exercise every provider flow against the report-only policy, tighten the directives from the observed violations, then switch the header to enforced.** The smoke check now distinguishes absent / report-only / enforced, and stays red until it is enforced. |
| **~~Dependency advisories~~** | **Addressed** — see the security sprint below. Production findings went from 31 (1 critical, 6 high) to **3 (0 critical, 3 high)**. |
| **~~Build cannot catch lint or type regressions~~** | **Addressed** — `eslint.ignoreDuringBuilds` and `typescript.ignoreBuildErrors` are now both `false`, and the production build still passes. A future type error or lint error can no longer reach a green build. |

## Security sprint — dependency hardening

Production advisories went from **31 (1 critical, 6 high)** to **3 (0 critical, 3 high)**.
Including devDependencies: **32 → 5**.

| Package | Was | Now | Effect |
| --- | --- | --- | --- |
| `@aws-sdk/client-s3`, `client-rekognition`, `s3-request-presigner` | 3.713.0 | 3.1106.0 | clears the **critical** `fast-xml-parser` entity-encoding bypass, which reached the tree through `@aws-sdk/core` |
| `axios` | 1.16.0 | 1.19.0 | clears both direct high advisories (`formDataToJSON` recursion DoS) |
| `postcss` (direct) | 8.5.15 | 8.5.26 | clears the XSS / arbitrary-file-read advisories |
| `nanoid`, `brace-expansion` | transitive | patched | resolved by `npm audit fix` |

### What deliberately remains, and why it is lower risk than it looks

All three remaining production findings are inside **Next's own bundled
dependencies**, and npm's only offered fix is `next@16`, a major upgrade:

- `node_modules/next/node_modules/postcss` — build-time only, never shipped to a browser.
- `node_modules/next/node_modules/sharp` at 0.34.5 — the advisory covers `<0.35.0`.
  **This is not the copy SnapNext uses.** The application's own `sharp` is 0.35.3
  at the top level and is not vulnerable. Next's bundled copy exists to serve the
  Image Optimization API, which `next.config.js` disables outright with
  `images.unoptimized: true`. An earlier draft of this report called `sharp` the
  highest-priority dependency because it "processes untrusted user-uploaded
  images" — that was wrong, and is corrected here.
- `next` itself is flagged only transitively via those two.

A `next@16` upgrade is worth planning, but it is a major-version change and does
not belong in a launch-blocker branch.

### Configuration issue found while doing this

`package.json` carries a `resolutions` block pinning `follow-redirects`,
`form-data`, `picomatch`, `postcss`, `yaml` and `lodash`. **`resolutions` is a
Yarn field; npm honours `overrides`.** CI and the Dockerfile both use `npm ci`,
so those pins are inert — proven directly: `resolutions` asks for `postcss@8.5.10`
while the installed version was `8.5.15`.

Nothing currently vulnerable depends on this, so it was left alone rather than
restructured inside a hardening PR. Note that porting the block to `overrides`
verbatim would be actively harmful: it would pin `postcss` *back* to 8.5.10,
which is inside the vulnerable range. Convert deliberately, with versions
re-checked.

## P2 — scope and process, not defects

- **Manual device QA has no recorded sign-off.** `docs/MOBILE_LAUNCH_QA.md` defines
  the real public-launch bar — zero unresolved P0 data-loss, auth, billing or
  privacy issues across a real-device matrix. No evidence in-repo that a pass has
  been run against current `main`. No automation closes this gate.
- **Native projects are generated on demand, and the policy gates are green.** Neither
  `android/` nor `ios/` is committed — deliberately, per `docs/NATIVE_LAUNCH_RUNBOOK.md`,
  so signing credentials and machine-specific files never land in git. The
  `native-preflight` workflow bootstraps both, runs `policy:android` / `policy:ios`,
  and compiles an Android debug shell and an unsigned iOS simulator build. Both jobs
  passed on this PR, so issue #88's **API 36 by 31 August 2026** requirement is already
  satisfied and enforced in CI. What remains for a store release is the owner-only work
  in the runbook — Play Console and App Store Connect setup, signing, listings, and
  real-device testing.
- **Dormant by design, not blockers.** Chat E2EE (`CHAT_E2EE_ENABLED`), the AI index
  (`AI_INDEX_ENABLED`) and the People/face gate (PR #158, draft) all fail closed and
  are absent from the runtime. Launching without them is a scope decision already
  made.
- **Two environment claims unverifiable from the repo.** The June audit flagged a
  missing `GEMINI_API_KEY` and unset S3 CORS in the deployed environment. Both are
  runtime config and that audit is six weeks stale — check them directly in
  Vercel/AWS.

## Recommended order

1. Run `npm run test:smoke` against the live URL to settle whether origin resolution
   was breaking production or only latent on the self-hosted path.
2. Exercise every external provider — Google Picker/Photos, OneDrive, Dropbox,
   Stripe, Supabase, media previews — against the report-only CSP, tighten the
   directives from the observed violations, then switch to the enforced header.
3. Decide explicitly whether offline/PWA support is a SnapNext launch promise. If
   it is not, amend `docs/MOBILE_LAUNCH_QA.md` and remove the service-worker smoke
   check rather than building one to satisfy a test.
4. Plan the `next@16` upgrade separately — it is the only remaining route to the
   three bundled advisories, and it is a major version.
5. Run the `docs/MOBILE_LAUNCH_QA.md` device pass on real iPhone and Android
   hardware and record the sign-off. That is the actual go/no-go gate.
6. Mark this PR ready and merge, then rebase the larger open feature PRs onto it so
   they inherit these launch and security fixes.
