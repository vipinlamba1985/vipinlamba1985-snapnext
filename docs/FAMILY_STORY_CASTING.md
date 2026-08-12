# SnapNext Family Story Casting

Family Story has one product promise: let people watch their real SnapNext memories together on a larger screen without transferring their SnapNext login to that screen.

## Viewing paths

### Universal Watch together

`Home / Memory Story -> Watch together -> snapnext.ai/watch`

This is the complete mixed photo + video experience and works on any TV, computer, or large-screen browser that can open SnapNext. The phone creates a five-minute pairing session, both screens show a matching verification code, and the phone must explicitly approve the screen. The phone then controls play, pause, previous, next, and end. An approved session lasts at most one hour.

Use this path whenever native routing is unavailable, whenever the user prefers a browser, or whenever an iPhone/iPad story contains photos.

### Android — Google Cast

The Capacitor Android shell includes the Google Cast sender framework and uses Google's Default Media Receiver. No SnapNext custom receiver registration is required for this sender path.

- User taps **Cast to TV**.
- Android presents the system Google Cast route chooser.
- After the user selects a Cast-enabled device, SnapNext creates an approved native Family Story session.
- SnapNext sends only temporary HTTPS media URLs for that session to the receiver.
- Photos auto-advance while the story is playing.
- Videos advance when the Cast receiver reports playback finished.
- Phone controls remain authoritative for play, pause, previous, next, route change, and end.

The branded `/watch` receiver remains available when a user wants the full SnapNext large-screen UI instead of the Default Media Receiver.

### iPhone / iPad — AirPlay

The Capacitor iOS shell uses Apple's public `AVRoutePickerView` and `AVPlayer` external-playback APIs.

- User taps **AirPlay videos**.
- SnapNext prepares a temporary video-only Family Story session.
- The native AirPlay route picker lets the user choose an AirPlay receiver.
- The selected video plays through `AVPlayer` with external playback enabled.
- Videos advance when playback reaches the end.
- Phone controls remain authoritative for play, pause, previous, next, route change, and end.

Direct AirPlay is intentionally video-only. Apple does not expose a public API that lets SnapNext silently turn an arbitrary mixed photo/video WebView story into system screen mirroring. If a story contains photos, **Watch together** remains the full-fidelity route and is always available.

## Privacy and trust model

Browser and native transports share the same Family Story ownership and expiry rules but use separate viewer mechanisms.

### Browser viewer

- TV receives no SnapNext login session.
- Viewer receives a separate random viewer proof.
- Each memory receives a separate random access token.
- Phone must approve the matching verification code before media becomes available.

### Native Cast / AirPlay

- The operating-system route picker is the explicit device-selection action.
- Native Family Story session is scoped to the signed-in user's selected photos/videos only.
- Server generates a random access token for each memory and stores only its SHA-256 hash.
- Receiver gets a temporary URL containing that one raw media token.
- `/api/family-watch/native-media` accepts only an active, approved native session, the correct slot, and the matching token.
- Ending or expiring the Family Story makes those URLs invalid.
- Production S3 objects are reached through short-lived signed read URLs.
- No account access token, refresh token, password, cookie, People metadata, face data, or unrelated Library item is sent to the receiver.

## Native generation

Native projects remain reproducible and are generated from source templates:

```bash
npm run native:bootstrap:android
npm run native:bootstrap:ios
npm run native:preflight -- --require-platforms
```

Android generation adds:

- `com.google.android.gms:play-services-cast-framework:22.3.1`
- `SnapNextCastOptionsProvider`
- `FamilyCastPlugin`
- Cast `OPTIONS_PROVIDER_CLASS_NAME` manifest metadata

The iOS generation injects:

- `AVKit` and `AVFoundation`
- `FamilyCastPlugin`
- the existing public AirPlay route picker / external playback bridge

No new contacts, location, microphone, SMS, call-log, or broad storage permission is required by Family Story casting.

## Release validation

Automated gates must pass before merge:

1. Full repository tests and production Next.js build.
2. TypeScript and ESLint quality gates.
3. Android API 36 bootstrap, policy check, and `assembleDebug` compile.
4. iOS 26 simulator bootstrap, policy check, and unsigned Xcode compile.
5. Vercel preview and runtime error scan.
6. Production `/watch` must remain reachable, noindex, and protected by the existing CSP.

## Physical-device release QA

CI proves compilation and product/security contracts; it cannot prove receiver discovery on real home networks. Before native-store release, test at least:

- Android phone + Chromecast / Google TV: route chooser, photo, video, auto-advance, play/pause, prev/next, disconnect, receiver loss, app background/foreground.
- iPhone/iPad + Apple TV/AirPlay TV: video route chooser, external playback, play/pause, prev/next, disconnect, receiver loss, app background/foreground.
- Mixed photo/video story on iOS: direct AirPlay copy must remain video-specific and Watch together must still launch the full story.
- Expired/ended native media URLs must stop working.
- Switching TVs must never expose media outside the active Family Story.

Physical QA is a store-release gate, not something CI may mark complete on the user's behalf.
