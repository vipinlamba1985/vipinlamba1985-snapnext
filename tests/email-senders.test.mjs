// Warm mail comes from hello@, account and security mail from support@, and a
// reply to either must reach a monitored inbox.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SENDER,
  SENDER_HELLO,
  SENDER_SUPPORT,
  replyToAddress,
  resolveSender,
} from '../lib/email/senders.js';
import { TEMPLATE_REGISTRY } from '../lib/email/templates.js';

const env = {
  EMAIL_FROM: 'support@snapnext.ai',
  EMAIL_FROM_NAME: 'SnapNext',
  EMAIL_FROM_WELCOME: 'hello@snapnext.ai',
  SUPPORT_EMAIL: 'support@snapnext.ai',
};

test('each identity uses its own address', () => {
  assert.equal(resolveSender(SENDER_HELLO, env), 'SnapNext <hello@snapnext.ai>');
  assert.equal(resolveSender(SENDER_SUPPORT, env), 'SnapNext <support@snapnext.ai>');
});

test('one configured address still works for everything', () => {
  // A deployment that has not split its addresses yet must keep sending.
  const single = { EMAIL_FROM: 'support@snapnext.ai', EMAIL_FROM_NAME: 'SnapNext' };
  assert.equal(resolveSender(SENDER_HELLO, single), 'SnapNext <support@snapnext.ai>');
  assert.equal(resolveSender(SENDER_SUPPORT, single), 'SnapNext <support@snapnext.ai>');
});

test('nothing configured falls back to the Resend test address', () => {
  assert.match(resolveSender(SENDER_HELLO, {}), /onboarding@resend\.dev/);
});

test('an address already written with a display name is left alone', () => {
  const preformatted = { EMAIL_FROM_WELCOME: 'SnapNext Team <hello@snapnext.ai>' };
  assert.equal(resolveSender(SENDER_HELLO, preformatted), 'SnapNext Team <hello@snapnext.ai>');
});

test('replies always go to the monitored inbox', () => {
  assert.equal(replyToAddress(env), 'support@snapnext.ai');
  // Even for mail sent from hello@, which may not be watched.
  assert.equal(replyToAddress({ EMAIL_FROM_SUPPORT: 'support@snapnext.ai' }), 'support@snapnext.ai');
  assert.equal(replyToAddress({}), undefined);
});

test('password and billing mail comes from support, welcome mail from hello', () => {
  const expected = {
    welcome: SENDER_HELLO,
    verify_email: SENDER_HELLO,
    family_invite: SENDER_HELLO,
    download_ready: SENDER_HELLO,
    forgot_password: SENDER_SUPPORT,
    password_changed: SENDER_SUPPORT,
    billing_failed: SENDER_SUPPORT,
    family_membership_ended: SENDER_SUPPORT,
  };

  for (const [template, sender] of Object.entries(expected)) {
    assert.equal(TEMPLATE_REGISTRY[template]?.sender, sender, `${template} sends from the wrong address`);
  }
});

test('every template declares a sender, and an unclassified one is safe', () => {
  for (const [name, def] of Object.entries(TEMPLATE_REGISTRY)) {
    assert.ok(
      [SENDER_HELLO, SENDER_SUPPORT].includes(def.sender),
      `${name} has no sender identity`,
    );
  }
  // A template added without one must fall back to the address a human reads.
  assert.equal(DEFAULT_SENDER, SENDER_SUPPORT);
});

test('anything about account access or money is never sent from hello@', () => {
  // hello@ is a friendly address; a password reset arriving from it reads as
  // phishing and may not be monitored for replies.
  for (const template of ['forgot_password', 'password_changed', 'billing_upgrade', 'billing_downgrade', 'billing_failed']) {
    assert.notEqual(TEMPLATE_REGISTRY[template].sender, SENDER_HELLO, `${template} must come from support`);
  }
});
