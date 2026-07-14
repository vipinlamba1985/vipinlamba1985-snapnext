# SnapNext Mobile Launch QA

Automated smoke checks cover routing, PWA assets, security headers, legal pages and mobile user-agent rendering. The following checks require physical devices because browsers cannot remotely reproduce the native Photos picker, background suspension, battery rules or OS share sheet.

## Required devices

- Current iPhone on Safari
- One older supported iPhone on Safari
- Current Android on Chrome
- One mid-range Android device on Chrome
- Desktop Safari and Chrome for comparison

## Account and authentication

- Sign up, confirm email, sign in and sign out
- Reset password and reopen the app from the reset email
- Let a session expire and confirm recovery does not lose an upload selection
- Accept a Family invitation after login and after creating a new account
- Confirm a normal user cannot open `/admin` or `/admin/operations`

## Upload acceptance matrix

Run each batch on iPhone Safari and Android Chrome:

| Batch | Expected behavior |
| --- | --- |
| 1 file | Normal queue, manual Start backup |
| 20 files | Normal queue, manual Start backup |
| 25 files | Smart Backup appears and starts automatically |
| 50 files | Two controlled upload lanes and six previews |
| 100 files | No browser crash; completed file memory is released |

For every batch verify:

- Photos and videos both upload
- Duplicate files are skipped clearly
- Upload progress continues while scrolling
- A failed item can be retried without restarting completed files
- Locking and reopening the phone does not falsely mark files complete
- Weak Wi-Fi and switching between Wi-Fi/cellular produce recoverable states
- Storage-full and file-too-large messages are accurate
- Family uploads consume the shared household quota
- Media appears in the gallery before optional AI processing completes
- AI provider failure never removes or blocks the stored file

## PWA and mobile UX

- Add SnapNext to the home screen
- Launch from the installed icon
- Confirm safe-area spacing around the notch and home indicator
- Verify no horizontal overflow at 320, 375, 390 and 430 CSS-pixel widths
- Check text-size accessibility at 100%, 125% and 150%
- Confirm buttons and upload controls remain tappable with one hand
- Rotate between portrait and landscape during upload
- Confirm offline state is understandable and queued actions recover when online
- Test the OS Share sheet and any configured share target

## Billing and Family

- Complete Plus, Pro and Family checkout on the web
- Return from checkout and confirm the correct entitlement
- Open the billing portal, cancel and verify access through the paid period
- Simulate a failed payment and verify the grace message
- Invite, resend, cancel, accept, leave and remove a Family member
- Confirm private libraries remain private throughout

## LifeGPT and stories

- Search by date, file type, confirmed person and confirmed event
- Confirm every narrative answer has valid numbered sources
- Confirm an unsupported answer falls back to Memory Brain results
- Mark one response Helpful and one Incorrect
- Generate a private event story and reopen the cached version
- Confirm no feature publishes or shares without an explicit action

## Release sign-off

Record device model, OS version, browser version, network type, batch size, pass/fail, screenshots and any request ID shown by the app. Public launch requires zero unresolved P0 data-loss, authentication, billing or privacy issues. P1 visual defects may be accepted only with an owner and target fix date.
