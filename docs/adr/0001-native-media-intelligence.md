# ADR 0001 — Native media intelligence through Capacitor plugins

**Status:** Accepted · **Date:** 2026-08-02

## Context

SnapNext wants "import only photos of these people". That cannot be done before
upload from a cloud provider: knowing who is in a photo requires analysing it,
and analysing it requires already having it. The device is the only place where
the photos and the analysis can both exist before anything is uploaded.

Two beliefs had to be corrected to reach this decision.

**Face grouping is not available from the operating system.** Photo-library
permission grants access to media, not to identities. Apple does not expose the
Photos People album through PhotoKit, and Android MediaStore has no equivalent.
`confirmedPersonIds` in `lib/smart-sync/native-bridge.js` was written as though
an OS could supply it. Nothing can. SnapNext must produce those identifiers
itself.

**A WebView shell is not a dead end.** An earlier assessment in this repository
concluded that the feature "needs a native client first", implying a separate
application. That was wrong. Capacitor bridges JavaScript to real Swift and
Kotlin through custom plugins, so the existing shell can gain native capability
without being replaced.

## Decision

Keep the Capacitor architecture. Add native capability through custom plugins
rather than building a second application.

- **Retain generated `ios/` and `android/` projects** once native development
  begins. They are currently disposable, recreated by `cap add` and patched by
  `scripts/native-bootstrap.mjs`. Custom plugin source cannot live in a
  directory that gets regenerated.
- **Custom Capacitor plugins** for anything browser JavaScript cannot do:
  photo-library enumeration, thumbnailing, face detection, embeddings, local
  storage of the people index.
- **Face detection and embedding run natively, on device.** Not in the WebView.
  JavaScript in a WebView cannot enumerate a photo library, and running an
  embedding model there would be slow and would not keep the data meaningfully
  local.
- **Biometric-derived data never leaves the device.** No embeddings, face crops,
  cluster centroids or local labels are uploaded. Only the final manifest of
  assets the user approved crosses the boundary.
- **TypeScript stays thin**: contracts, capability detection, progress events,
  user controls, manifest generation. No analysis.
- **No separate React Native application** unless a measured evaluation shows
  Capacitor cannot meet performance or lifecycle requirements. That evaluation
  has not been done, so the question is open, not decided against.

## Consequences

The server contracts are already correct and stay unchanged.
`validateNativeManifest` accepts `confirmedPersonIds`; `buildNativeUploadPlan`
filters on them through the `favorite_people` rule. They are waiting for a
producer, not for a redesign.

`confirmedPersonIds` are SnapNext-generated local identifiers. They are
filtering metadata — never proof of identity, never an authorisation control.
The server continues to verify ownership, size, MIME type, file signature,
quota and duplicates independently of anything the device claims.

Retaining `ios/` and `android/` means taking on their maintenance. Today
`native-bootstrap.mjs` regenerates and patches them idempotently, which is why
`native-preflight.yml` can build both platforms from a clean checkout. Once
custom plugin source lives there, that script becomes a migration rather than a
regeneration, and the preflight workflow will need revisiting.

Phase 1 — manual native selection — needs none of this. It needs a
photo-library plugin and nothing more, and it must not be blocked on the model
decision.

## What is not decided

No embedding model has been chosen. That gate is legal and privacy as much as
technical: commercial-use licence, redistribution rights, provenance, iOS and
Android conversion and performance, accuracy, bias and false-match evaluation,
local database encryption, app-store privacy declarations, consent and deletion
UX, and physical-device benchmark targets. Phase 2 cannot be scoped until those
are recorded.

## Where the code will live

This is a map, not a claim that anything exists.

```
TypeScript / JavaScript
  Capacitor plugin declaration and capability detection
  Progress events and user controls
  Manifest conversion, review UI

iOS (Swift)
  PhotoKit permission and enumeration (including limited access)
  Thumbnail retrieval
  Vision face detection
  Core ML embedding model
  Encrypted local people index
  Lifecycle and background-task handling

Android (Kotlin)
  Photo Picker / MediaStore access
  Thumbnail retrieval
  ML Kit or native face detection
  TensorFlow Lite or approved embedding model
  Encrypted local people index
  Lifecycle and WorkManager integration
```
