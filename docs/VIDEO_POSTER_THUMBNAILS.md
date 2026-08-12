# Video poster thumbnails

SnapNext Library video tiles may display a small poster JPEG without loading the original video into the browsing grid.

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

This launch implementation does **not** perform an unattended backfill over existing videos and does not download cloud-imported video originals merely to create browsing posters. Those videos keep the existing lightweight play-card fallback until a trusted local/device poster source exists.

That limitation is intentional: generating a prettier grid must not silently create video-transcoding infrastructure, cloud egress, cold-storage retrieval, or per-video processing cost.

## Privacy and ownership

Poster upload requires an authenticated user and the target video must belong to that user and not be trashed. The server validates the small image derivative with Sharp and stores only the normalized JPEG derivative. It does not decode the source video.

## Gallery behavior

Row virtualization remains authoritative. Only currently rendered video rows request poster URLs. A missing poster returns a non-cacheable 404 and the existing video fallback remains visible; the Library does not fetch the original video as a substitute.

## Future work

If poster coverage for historical or cloud-imported videos becomes necessary, add it only through an explicitly costed and measured path (for example, trusted native extraction when the original is already local). Do not introduce bulk server transcoding as an implicit Gallery dependency.
