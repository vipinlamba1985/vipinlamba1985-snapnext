# SnapNext chat end-to-end encryption rollout

## Current scope

This foundation introduces browser-side cryptographic primitives and server routes that store only public device keys, wrapped conversation keys, and encrypted message envelopes.

It is disabled by default:

```text
CHAT_E2EE_ENABLED=false
```

Do not display an encryption badge unless a thread has both `encryptionMode: e2ee-v1` and `e2eeReadyAt`.

## Cryptography

- Device identity keys: ECDH P-256
- Key derivation: HKDF-SHA-256
- Conversation-key wrapping: AES-256-GCM
- Message encryption: AES-256-GCM with authenticated context
- Private device keys must remain on the user device and must never be sent to SnapNext APIs.

## Collections

- `chat_e2ee_devices`: public device keys only
- `chat_e2ee_thread_keys`: one wrapped conversation-key envelope per recipient device and key version
- `chat_messages`: ciphertext envelope for encrypted messages

## Safe rollout sequence

1. Register a device public key.
2. Create a conversation key on an approved member device.
3. Wrap that key independently for every active device of every approved member.
4. Store all wrapped-key envelopes.
5. Enable encrypted sending only when every current member has at least one wrapped key.
6. Rotate the conversation key when a member is removed, a device is revoked, or membership changes.
7. Keep existing plaintext conversations labelled as not end-to-end encrypted until intentionally upgraded.

## Still required before production activation

- Secure device-private-key storage using WebAuthn/Keychain/Keystore or an encrypted local vault
- Multi-device approval and recovery flow
- Conversation upgrade interface
- Key rotation and member-removal workflow
- Encrypted attachment file keys for photos, videos, stickers, and voice messages
- E2EE-aware edit/delete operations
- Explicit user-controlled abuse reporting that submits selected decrypted evidence
- Independent cryptography/security review
- Real two-device and multi-member interoperability testing

## Product constraints

Server-side AI, search, moderation, and previews cannot inspect encrypted message content. Those features must run locally or require explicit user consent to share selected decrypted content.
