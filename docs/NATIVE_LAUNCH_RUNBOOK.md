# SnapNext Native Launch Runbook

This runbook generates and validates the Capacitor Android and iOS projects from the shared SnapNext web application. Generated projects are reproducible so signing credentials and machine-specific files are never committed accidentally.

## One-command project generation

```bash
npm ci
npm run native:bootstrap
npm run native:preflight -- --require-platforms
```

Platform-only commands:

```bash
npm run native:bootstrap:android
npm run native:bootstrap:ios
```

The bootstrap performs `cap add` when a platform is absent, runs `cap sync`, and applies SnapNext's launch policy:

- app ID `ai.snapnext.app`
- HTTPS-only production origin
- Android compile and target API 36
- Android minimum API 24
- iOS minimum deployment target 15.0
- `snapnext://oauth` return scheme on both platforms
- clear photo-library permission explanations on iOS
- no contacts, location, microphone, call-log, SMS, or all-files permissions

## Local build checks

Android requires Android Studio, Android SDK 36, and Java 21:

```bash
npm run native:bootstrap:android
npm run policy:android
cd android && ./gradlew assembleDebug
```

iOS requires macOS and Xcode 26 or later:

```bash
npm run native:bootstrap:ios
npm run policy:ios
npm run native:open:ios
```

Use Xcode to select your Apple team and run on a real iPhone. The GitHub native-preflight workflow compiles an unsigned simulator build; it does not create an App Store archive.

## Permissions policy

Manual selection should use the operating-system picker and request access only to user-selected memories. Automatic full-library Smart Sync remains disabled until the native PhotoKit/MediaStore bridge and resumable background uploader are implemented and reviewed.

Do not add contacts, location, microphone, call-log, SMS, or Android `MANAGE_EXTERNAL_STORAGE` permissions. Add any new permission only together with a product requirement, user-facing explanation, privacy-policy update, and automated policy test.

## Items that still require the owner

- Apple Developer Program membership and App Store Connect app
- Apple distribution signing, provisioning profile, and final bundle ownership
- Google Play Console app, Play App Signing, and release keystore setup
- final store names, descriptions, screenshots, age rating, privacy disclosures, and support URLs
- production OAuth credentials and `snapnext://oauth` callback registration where supported
- final legal review of Privacy Policy and Terms
- real-device TestFlight and Play internal testing approval

Never commit `.env` files, private keys, provisioning profiles, keystores, service-account JSON, or OAuth client secrets.
