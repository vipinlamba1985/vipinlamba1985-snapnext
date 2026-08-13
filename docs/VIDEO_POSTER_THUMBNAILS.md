# Video poster thumbnails

SnapNext Library video tiles prefer a small poster JPEG so ordinary browsing does not need to decode original videos.

## Launch contract

- A poster is extracted **on the user's device** from a video File the user already selected for backup.
- Poster extraction starts only inside the explicit backup flow.
- The original video is not sent to a separate transcoding, AI, Rekognition, MediaConvert, or ffmpeg service for this feature.
- Only a bounded JPEG derivative (480 px maximum edge, at most 768 KiB before server validation) is uploaded after the media item exists.
- Backup completion does not wait for poster generation or poster persistence.
- Poster failure never changes a successful backup into a failed backup.
- Poster objects live under the hot `thumbs/` derivative prefix, not under the original `users/` prefix.
- The authenticated thumbnail route may read a cached video poster, but it must never fall through to the original video when a poster is missing.

## Existing and cloud-imported videos

SnapNext still does **not** run an unattended historical backfill and does not introduce server-side video transcoding.

When a currently rendered Library tile belongs to an older video with no stored poster, the client may use the authenticated original media URL with `preload="metadata"` and a bounded seek near the beginning of the video to display a real frame instead of a black placeholder. This fallback exists only for the virtualized rows currently on screen; it does not scan or decode the whole library in the background.

This is a deliberate tradeoff: historical videos may incur a small on-demand media read when their missing poster is actually visible, but SnapNext avoids a bulk video-processing job, AI call, Rekognition call, MediaConvert job, or ffmpeg service. Newly backed-up videos continue to use the small persisted JPEG poster path.

## Privacy and ownership

Poster upload requires an authenticated user and the target video must belong to that user and not be trashed. The server validates the small image derivative with Sharp and stores only the normalized JPEG derivative. It does not decode the source video.

The legacy live-frame fallback also uses the user's authenticated media endpoint and does not send the video to a third-party processing provider.

## Gallery behavior

Row virtualization remains authoritative. Only currently rendered video rows request poster URLs. A missing poster returns a non-cacheable 404; the visible tile then falls back to the browser's native video decoder with metadata-only preload and a bounded seek so the user sees an actual video frame where the device/browser codec permits it. If the codec cannot decode the video, the lightweight play-card fallback remains available.

## Future work

If persistent poster coverage for all historical or cloud-imported videos becomes necessary, add it only through an explicitly costed and measured path, preferably trusted native extraction when the original is already local. Do not introduce bulk server transcoding as an implicit Gallery dependency.
