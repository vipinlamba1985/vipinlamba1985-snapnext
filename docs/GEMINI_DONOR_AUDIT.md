# Gemini donor repository extraction audit

Date: 2026-07-12
Production repository: `vipinlamba1985/vipinlamba1985-snapnext`
Donor reviewed: `Snapnext-Gemini-main` from `snapnext-updated.zip`

## Decision

No runtime code from the Gemini donor should be copied into the production application. The live Next.js repository already contains equivalent or stronger implementations for the useful concepts, while the donor contains several simulated or prototype-only fallbacks that would weaken production reliability.

## Valuable donor concepts and disposition

| Donor concept | Production disposition |
|---|---|
| Adaptive large-batch upload | Already implemented in live commit `4a1f168`: automatic Smart Backup, limited previews, two workers, completed-file memory release. |
| iOS media-picker handling | Live repository has a newer dedicated fix in commit `291271f`. |
| Duplicate prevention | Live repository has preflight duplicate/quota enforcement (`19f544f`) and duplicate-race object cleanup (`973a27c`). Donor client hashing is not copied because the live server-side flow is safer and already handles race conditions. |
| AWS S3 presigned uploads | Already native to the live Next.js architecture. Donor mock upload receiver is rejected. |
| Face/people organization | Live repository uses real, cost-gated AWS Rekognition controls and least-privilege IAM work. Donor face grouping is primarily presentation/metadata-based and is rejected. |
| ZIP/download ideas | Donor implementation includes simulated export URLs and synchronous prototype behavior. Do not copy without a separate production design for limits, jobs, expiry, and recovery. |
| Smart Cleanup UI | Donor blur and screenshot detection relies mainly on filenames, tags, and captions. This is not trustworthy computer vision and is rejected. |
| Memories/Create UI | Product ideas may remain design references, but no component is copied because the donor uses a different Vite/Express architecture and would duplicate current routes/design. |
| Supabase schema/RLS examples | Treat as reference only. Never run the donor schema wholesale against production. Production migrations must be incremental, idempotent, and matched to existing tables. |
| Setup documentation | Donor docs are not copied because they describe donor-specific architecture and include outdated/mock fallback assumptions. |

## Explicitly rejected donor behavior

- Mock authentication or in-memory paid-user data
- Mock S3 upload receiver
- Simulated Stripe checkout success
- Artificial admin telemetry and QA logs
- Hard-coded administrator identity
- Filename/tag-based claims of blur detection
- Placeholder face matching presented as real AI
- Wholesale Vite/Express replacement of the live Next.js application

## Safety result

This audit intentionally makes no runtime, API, database, billing, authentication, upload, design, or route changes. The production application remains unchanged.

The Gemini donor repository no longer contains unique production code required by the live application. Keep this audit in the production repository as the record of why the donor was not merged.
