# Face indexing decision — superseded by Favourite People

**Status:** Superseded.

The earlier design indexed faces broadly and then tried to control cost by excluding large group photos after Rekognition returned. That architecture is no longer the launch model.

SnapNext now uses a narrower rule:

- local on-device/web face counting remains the first gate;
- 0-face photos do not enter AWS recognition;
- 5+ face photos are classified as group photos and do not enter automatic AWS recognition;
- cloud recognition is limited to explicitly selected **Favourite People**;
- Free has no automatic cloud Favourite People recognition;
- Starter allows 2 Favourite People;
- Plus, Pro and Family allow 3 Favourite People;
- unmatched faces never create a new cloud person;
- the Favourite-only Rekognition collection retains only user-chosen enrolment reference faces;
- face vectors created from ordinary photos are temporary and are deleted after the match attempt, including successful matches;
- removing a Favourite deletes that person's retained AWS user/reference vectors without deleting the user's photos;
- full face-data deletion removes and verifies both the retired legacy collection and the Favourite-only collection.

The retired broad People engine remains in source only for legacy compatibility/migration. User-facing automatic reindex and recovery routes must not call it.

See `docs/FAVORITE_PEOPLE_RECOGNITION.md` for the current product and engineering contract.
