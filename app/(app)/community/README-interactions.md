# Premium chat interaction UI

This folder now contains reusable UI and API helpers for:

- Replying to a specific chat message
- Displaying reply context above the composer
- Showing reaction counts
- Toggling quick emoji reactions

Integration points for `page.js`:

1. Import `MessageInteractionBar`, `ReplyComposerBanner`, `sendReply`, and `toggleReaction`.
2. Keep a `replyingTo` state value.
3. Render `MessageInteractionBar` below each message.
4. Render `ReplyComposerBanner` above the composer when replying.
5. Route composer submission through `sendReply` when `replyingTo` is active.
6. Update the local message reaction map after `toggleReaction` returns.

The components use the existing authenticated `/social-chat-interactions` API and preserve all current consent, membership, and posting-permission checks.
