// Which address each email comes from.
//
// Two identities, split by what the message is:
//
//   hello@    Warm, expected mail — welcome, verification, invitations, a
//             finished download. Mail somebody is pleased to get.
//   support@  Account, security and money — password reset, password changed,
//             billing, losing access. Mail somebody may need to reply to, and
//             which must come from an address a human actually reads.
//
// Replies always go to the support address regardless of sender, so a user who
// hits reply on any SnapNext email reaches a monitored inbox rather than one
// nobody watches.
//
// No imports, so the routing can be tested without a mail provider.

export const SENDER_HELLO = 'hello';
export const SENDER_SUPPORT = 'support';

/**
 * Support is the default on purpose. A new template that nobody has classified
 * should come from the address that is monitored and can receive a reply — the
 * safe failure is a slightly formal email, not an unanswerable one.
 */
export const DEFAULT_SENDER = SENDER_SUPPORT;

/**
 * Resolves the sender identity for a template.
 * `EMAIL_FROM` remains the account-wide default so existing deployments keep
 * working with one address until a second one is configured.
 */
export function resolveSender(senderKey, env = process.env) {
  const fallbackAddress = env.EMAIL_FROM || 'onboarding@resend.dev';
  const fallbackName = env.EMAIL_FROM_NAME || 'SnapNext AI';

  const address = senderKey === SENDER_HELLO
    ? (env.EMAIL_FROM_WELCOME || fallbackAddress)
    : (env.EMAIL_FROM_SUPPORT || fallbackAddress);

  const name = senderKey === SENDER_HELLO
    ? (env.EMAIL_FROM_WELCOME_NAME || fallbackName)
    : (env.EMAIL_FROM_SUPPORT_NAME || fallbackName);

  // An address already written as `Name <addr>` is passed through untouched.
  return /</.test(address) ? address : `${name} <${address}>`;
}

/** Where replies go, whichever address sent the message. */
export function replyToAddress(env = process.env) {
  return env.SUPPORT_EMAIL || env.EMAIL_FROM_SUPPORT || undefined;
}
