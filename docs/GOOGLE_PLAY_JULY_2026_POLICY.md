# Google Play policy update — July 15, 2026

SnapNext reviewed Google Play's July 15, 2026 policy announcement.

## Impact on SnapNext

- SnapNext chat must remain account-based and relationship/community based. It must not introduce anonymous identity masking or random stranger matching without a separate age-restricted design and Play Console minor-blocking controls.
- SnapNext must maintain public standards prohibiting child sexual abuse and exploitation, an in-app reporting path, a process to remove prohibited material, a legally compliant escalation process, and a designated child-safety contact.
- SnapNext must not request `READ_CALL_LOG` for phone-call verification. Authentication should use email/OAuth or approved Android verification APIs.
- Third-party AI providers are covered by Google Play User Data requirements. Data sent to AI providers must be disclosed, limited to the requested purpose, protected, and subject to user consent where required.
- New Android releases and app updates submitted on or after August 31, 2026 must target Android 16 / API 36 or higher.
- The Play Console app-registration status and content rating must be confirmed before every production release.

## Release controls

Run `npm run policy:android` after `npx cap sync android` and before generating an Android App Bundle. The check fails when the generated project requests prohibited call-log permissions or targets below API 36.

## Manual Play Console checks

1. Confirm the SnapNext Play app is registered under Android developer verification.
2. Complete or update Data safety disclosures for AWS, Supabase, Stripe, Google AI/OpenAI and any analytics provider actually enabled.
3. Confirm the app has a valid content rating.
4. Publish `/child-safety` and provide the designated contact in Play Console.
5. Confirm in-app reporting is reachable from chat, community and support surfaces before enabling public social features.
