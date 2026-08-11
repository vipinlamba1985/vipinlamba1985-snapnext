# People recognition — production activation readiness

People recognition is intentionally **fail closed** in production. Shipping the code is not the same as activating paid cloud face recognition.

`FACE_PROCESSING_ENABLED=true` is only a request to enable cloud People processing. In production it becomes effective only after all three independent readiness attestations below are also true:

| Environment variable | Set to `true` only after |
|---|---|
| `PEOPLE_ACTIVATION_AWS_VERIFIED` | The actual production AWS role has been tested for the Rekognition actions SnapNext needs, including `DescribeCollection`. |
| `PEOPLE_ACTIVATION_BACKUP_RESTORE_VERIFIED` | MongoDB Atlas backup/PITR and object-storage versioning/lifecycle/restore behavior have been checked in the live production setup. |
| `PEOPLE_ACTIVATION_DEVICE_QA_VERIFIED` | A signed-in physical iPhone and Android device have completed the local face-count/upload flow successfully, including the 0 / 1–4 / 5+ boundary. |

## What this interlock does

- Production cloud recognition stays off if even one attestation is missing.
- Local face detection remains a separate capability and can be tested independently with its own consent and rollout flag.
- Development/test environments do not require fake production attestations.
- The readiness helper exposes only gate IDs, labels and booleans. It never returns environment variable names or values to a client.
- These variables are operator attestations. They do **not** replace the underlying real-world checks.

## Activation sequence

1. Keep `FACE_PROCESSING_ENABLED=false` while validating infrastructure and devices.
2. Verify production AWS permission and set `PEOPLE_ACTIVATION_AWS_VERIFIED=true`.
3. Verify backup/restore behavior and set `PEOPLE_ACTIVATION_BACKUP_RESTORE_VERIFIED=true`.
4. Run the physical iOS + Android signed-in QA and set `PEOPLE_ACTIVATION_DEVICE_QA_VERIFIED=true`.
5. Confirm the independent cloud face-recognition consent flow is correct.
6. Only then set `FACE_PROCESSING_ENABLED=true` and enable the remaining intended People rollout flags.
7. Run a small canary batch before broad rollout; keep the existing cost and crowd-photo gates in force.

Never set an attestation merely to make a readiness check green. If the underlying production evidence is unavailable, leave the gate false and People recognition remains safely disabled.
