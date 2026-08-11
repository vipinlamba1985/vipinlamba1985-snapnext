# Favourite People Recognition — Launch Contract

## Product promise

SnapNext does not use cloud recognition to discover everyone in a user's library. Cloud matching exists only to help the user find a small number of people they explicitly choose as **Favourite People**.

## Plan limits

| Plan | Automatic cloud Favourite People |
|---|---:|
| Free | 0 — local face detection only |
| Starter | 2 |
| Plus | 3 |
| Pro | 3 |
| Family | 3 |
| Super User | 3 |

These limits are independent of Magic Library's broader active-person/view limits.

## Recognition pipeline

1. The photo remains user-owned original media.
2. Trusted local analysis runs first and records only the face-count gate needed by the cloud decision.
3. 0 faces → no cloud recognition.
4. 5+ faces → Group photos; no automatic cloud recognition.
5. 1–4 faces → continue only if production activation gates, cloud recognition consent, plan entitlement, Favourite selection and Favourite enrolment are all ready.
6. AWS uses a separate per-user Favourite-only collection.
7. Each Favourite is enrolled from a user-chosen clear solo photo (exactly one locally detected face).
8. Ordinary eligible photos are temporarily indexed for matching only against enrolled Favourite users.
9. A matching face attaches the media to that selected Favourite Person locally in SnapNext.
10. An unmatched face is ignored. It never creates a new cloud Person or Rekognition user.
11. Every ordinary-photo face vector created for matching is deleted after the match attempt. The cloud collection retains only the Favourite enrolment references.

## Consent and privacy

Local face detection and cloud Favourite People recognition remain separate consent states. Enabling local detection does not enable AWS recognition. Revoking cloud recognition stops future cloud matching but does not claim stored recognition data has been deleted. Verified deletion remains a separate explicit lifecycle.

## Removal and deletion

Removing one Favourite Person:

- removes that person from the recognition allowlist;
- deletes the corresponding Rekognition user association and retained enrolment face vectors;
- deletes the Favourite enrolment record;
- removes automatic Favourite-match links for that person;
- does not delete original photos or manually assigned People links.

Requesting full face-recognition deletion:

- deletes the retired legacy per-user Rekognition collection if it exists;
- deletes the Favourite-only per-user Rekognition collection if it exists;
- deletes face-index, Favourite enrolment and person-cluster recognition state;
- clears recognition selections and other cloud-derived People references;
- verifies both AWS collections are absent and all required SnapNext stores are empty before reporting verified deletion.

## Activation boundary

The existing production interlock remains authoritative. Cloud Favourite People recognition must stay fail-closed until AWS permission, backup/restore behaviour and physical-device QA are genuinely verified and the user has explicitly granted cloud recognition consent.

## Engineering invariant

User-facing automatic scan/recovery routes must import `favorite-people-recognition.server.js`, never the retired broad `people-intelligence.server.js` discovery engine. Any future change that creates a cloud identity for an unmatched face violates this contract.
