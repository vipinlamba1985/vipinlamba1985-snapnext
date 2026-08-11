# SnapNext Launch Readiness — QA Report

Reviewed against `main` at `2c5b49d` and hardened on PR #159. The branch was exercised through repository tests, strict TypeScript/ESLint production gates, the production build, Docker CI, native preflight, dependency audit visibility, and an exact-commit Vercel preview.

## Current automated launch status

Exact validated code head before this documentation-only update: `a2b69291741c387a40cf268072772b8ceec6fdf9`.

| Gate | Before | Current result |
| --- | --- | --- |
| `npm test` | 509 / 509 | **522 / 522** — includes 10 origin regression tests and 3 CSP launch-policy tests |
| ESLint | 1 blocking error | **0 errors**; remaining findings are advisory warnings |
| TypeScript | clean | **clean** |
| Production build | passed while lint/type bypasses existed | **passes with `ignoreDuringBuilds: false` and `ignoreBuildErrors: false`** |
| Product quality gate | not launch-clean | **PASS** |
| Docker Image | existing | **PASS** |
| Native preflight | existing | **PASS** for generated Android/iOS shells and policy checks |
| Vercel preview | no enforced CSP proof | **READY; HTTP 200 on exact preview and enforced CSP verified live** |
| Production dependency audit | 1 critical + 6 high | **0 critical + 3 high**; remaining production findings are bundled under current Next and require a separate Next 16 migration |

The exact Vercel preview for `a2b6929…` was deployment `dpl_2JPpBPTgPM6YWrAqNm7U1fcJfxYS`. The live root response returned HTTP 200 and carried both `Content-Security-Policy` and `Content-Security-Policy-Report-Only`.

## P0 fixes completed

### 1. Browser origin / CSRF resolution

The self-hosted standalone path could compare browser writes against an internal localhost origin instead of the public host, causing legitimate writes to fail with `403 origin_not_allowed`.

Origin resolution now derives the app origin from `x-forwarded-host` / `x-forwarded-proto`, then `Host`, rather than trusting an internal localhost URL. `CORS_ORIGINS` is additive for genuinely separate browser origins and is documented in the environment templates. Regression tests prove same-origin proxy traffic is accepted while cross-site origins remain rejected.

### 2. Next.js security patch within the current major

`next` was moved from 15.5.16 to **15.5.23**, clearing the direct App Router middleware-bypass exposure without forcing a framework-major migration during launch hardening.

### 3. Required lint/type build gates restored

The blocking React hook lint error was corrected. `eslint.ignoreDuringBuilds` and `typescript.ignoreBuildErrors` are both `false`, so future lint/type regressions cannot hide behind a green production build.

## Security hardening completed

Production-relevant dependency paths were reduced from **1 critical + 6 high** to **0 critical + 3 high**.

- AWS SDK clients and S3 presigner: `3.713.0` → `3.1106.0`, removing the critical `fast-xml-parser` path.
- Axios: `1.16.0` → `1.19.0`.
- Direct PostCSS upgraded to a safe 8.5.x release.
- SnapNext's direct `sharp` is outside the advisory range; the remaining flagged `sharp`/PostCSS copies are bundled below current Next.
- A Next 16 migration remains separate because it is a breaking framework-major change and is not needed to close the direct launch P0s.

## Content Security Policy — enforced for launch

CSP is no longer a launch blocker.

SnapNext now serves **two policies**:

1. **Enforced compatibility-first baseline — `Content-Security-Policy`.** It provides the launch security boundary while preserving HTTPS provider compatibility. High-value protections include `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, same-origin defaulting, bounded script sources, and controlled worker/media/connect directives.
2. **Tighter observational policy — `Content-Security-Policy-Report-Only`.** It keeps the narrower Stripe/Google/Dropbox frame and script assumptions visible so authenticated provider QA can tighten the enforced baseline later without first risking checkout or cloud-import outages.

`tests/csp-launch-policy.test.mjs` locks both policies and their critical directives. The launch smoke test now requires the enforced CSP and the strict report-only policy.

Provider QA is still required as a **functional compatibility and future-tightening check**, not as a prerequisite for having an enforced CSP.

## Service-worker decision — resolved

SnapNext is **online-first for launch**. A service worker, offline browsing, cached authenticated pages, and offline upload execution are not launch requirements.

The smoke test therefore does not require `/sw.js`. Physical-device QA instead requires a clear recoverable network-loss state and proves that reconnect/resume/retry does not duplicate already completed uploads.

## Remaining release validation that automation cannot truthfully close

### Authenticated provider matrix

Using a real signed-in test account, exercise:

- Supabase sign-in/session recovery
- Stripe checkout and billing return flow
- Google cloud selection / Picker
- Dropbox OAuth/import flow
- OneDrive OAuth/import flow
- authenticated media previews / presigned media

Confirm the enforced baseline does not block any flow and review strict report-only violations before narrowing the baseline further. This requires provider credentials, interactive OAuth/checkout, and a real authenticated browser session; repository CI cannot substitute for it.

### Physical-device matrix

Run `docs/MOBILE_LAUNCH_QA.md` on real iPhone and Android hardware, including Photos/media picker behavior, background suspension, Wi-Fi/cellular changes, share sheet behavior, and disconnect/reconnect upload recovery. Public release still requires zero unresolved P0 data-loss, authentication, billing, or privacy issues.

## Launch decision

**Automated code/security/build gates: GREEN.**

PR #159 should remain Draft until the authenticated-provider functional pass and real-device release matrix are signed off. That Draft status is now about genuine interactive release validation, not a red code/security gate.

After those two checks pass, mark PR #159 Ready, merge it, and then rebase larger feature branches so they inherit these launch/security fixes. Keep the Next 16 migration as an independent regression-tested upgrade.
