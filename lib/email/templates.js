// SnapNext AI email templates. Each export returns { subject, html, text }.
// All templates are mobile-friendly (single-column, max-width 600px, inline CSS).

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@snapnext.ai';

function shell({ title, preheader, bodyHtml, footerExtra = '' }) {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#0b0414;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none!important;opacity:0;visibility:hidden;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${escape(preheader || '')}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0414;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;">
        <tr><td style="padding:28px 28px 0 28px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
            <td style="width:48px;height:48px;text-align:center;vertical-align:middle;"><img src="${escape(baseUrl)}/logo.png" width="48" height="48" alt="SnapNext AI" style="display:block;width:48px;height:48px;object-fit:contain;border:0;"/></td>
            <td style="padding-left:10px;font-size:18px;font-weight:700;color:#0b0414;">SnapNext AI</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 28px 8px 28px;color:#0b0414;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:24px 28px 28px 28px;border-top:1px solid #f0eef4;color:#6b7280;font-size:12px;line-height:1.6;">
          Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#7c3aed;text-decoration:none;">${SUPPORT_EMAIL}</a><br/>
          © SnapNext AI — Your memories, beautifully organized.
          ${footerExtra}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 8px auto;"><tr><td style="background:linear-gradient(135deg,#ec4899,#7c3aed);border-radius:999px;"><a href="${escape(url)}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">${escape(label)}</a></td></tr></table>`;
}

function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function unsubscribeFooter(unsubUrl) {
  if (!unsubUrl) return '';
  return `<br/><br/><a href="${escape(unsubUrl)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from these emails</a>`;
}

// ---------- TRANSACTIONAL ----------

export function verifyEmailTemplate({ name, verifyUrl }) {
  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:24px;">Welcome to SnapNext AI ✨</h1>
    <p style="margin:0;color:#374151;font-size:15px;line-height:1.55;">Hi ${escape(name || 'there')}, thanks for joining. Verify your email to secure your account and unlock all features.</p>
    ${button('Verify email', verifyUrl)}
    <p style="margin:16px 0 0 0;color:#6b7280;font-size:13px;line-height:1.55;">This verification link expires in 24 hours. If the button doesn't work, paste this URL into your browser:<br/><a href="${escape(verifyUrl)}" style="color:#7c3aed;word-break:break-all;">${escape(verifyUrl)}</a></p>
    <p style="margin:16px 0 0 0;color:#6b7280;font-size:12px;">If you didn't create a SnapNext AI account, you can safely ignore this email.</p>
  `;
  return { subject: 'Verify your SnapNext AI email', html: shell({ title: 'Verify your email', preheader: 'Confirm your email to activate your SnapNext AI account.', bodyHtml }), text: `Verify your email: ${verifyUrl} (expires in 24h)` };
}

export function welcomeTemplate({ name, appUrl }) {
  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:24px;">You're in, ${escape(name || 'friend')} 🎉</h1>
    <p style="margin:0;color:#374151;font-size:15px;line-height:1.55;">Your email is verified. Here's how to get the most out of SnapNext AI in the next 5 minutes:</p>
    <ul style="padding-left:18px;color:#374151;font-size:15px;line-height:1.7;">
      <li><strong>Back up your photos</strong> — one tap, greedy upload.</li>
      <li><strong>Generate AI captions</strong> — vision-aware, platform-ready.</li>
      <li><strong>Build memories</strong> — monthly highlights and “on this day”.</li>
      <li><strong>Explore the gallery</strong> — search, filter, favorite, share.</li>
    </ul>
    ${button('Open SnapNext AI', appUrl || '#')}
  `;
  return { subject: 'Welcome to SnapNext AI', html: shell({ title: 'Welcome', preheader: 'Here are 4 things to try first.', bodyHtml }), text: `Welcome to SnapNext AI! Open the app: ${appUrl || ''}` };
}

export function forgotPasswordTemplate({ name, resetUrl }) {
  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:24px;">Reset your password</h1>
    <p style="margin:0;color:#374151;font-size:15px;line-height:1.55;">Hi ${escape(name || 'there')}, we received a request to reset your SnapNext AI password.</p>
    ${button('Reset password', resetUrl)}
    <p style="margin:16px 0 0 0;color:#6b7280;font-size:13px;line-height:1.55;">This link expires in <strong>1 hour</strong> and can be used only once. If the button doesn't work, paste this URL into your browser:<br/><a href="${escape(resetUrl)}" style="color:#7c3aed;word-break:break-all;">${escape(resetUrl)}</a></p>
    <div style="margin-top:20px;padding:12px 14px;background:#fdf2f8;border-left:4px solid #ec4899;border-radius:8px;color:#6b7280;font-size:13px;">
      <strong>Didn't request this?</strong> You can safely ignore this email — your password will remain unchanged.
    </div>
  `;
  return { subject: 'Reset your SnapNext AI password', html: shell({ title: 'Reset your password', preheader: 'Reset link inside (expires in 1 hour).', bodyHtml }), text: `Reset your password: ${resetUrl} (expires in 1h, single-use)` };
}

export function passwordChangedTemplate({ name, supportEmail = SUPPORT_EMAIL }) {
  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:24px;">Your password was changed ✅</h1>
    <p style="margin:0;color:#374151;font-size:15px;line-height:1.55;">Hi ${escape(name || 'there')}, this is a confirmation that the password for your SnapNext AI account was just changed.</p>
    <div style="margin-top:20px;padding:14px 16px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:8px;color:#6b7280;font-size:13px;line-height:1.55;">
      <strong>Didn't make this change?</strong> Contact us immediately at <a href="mailto:${escape(supportEmail)}" style="color:#dc2626;">${escape(supportEmail)}</a> so we can secure your account.
    </div>
  `;
  return { subject: 'Your SnapNext AI password was changed', html: shell({ title: 'Password changed', preheader: 'A security notice from SnapNext AI.', bodyHtml }), text: `Your SnapNext AI password was changed. If this wasn't you, contact ${supportEmail} immediately.` };
}

// ---------- STUBS (Phase 2 / feature-dependent) ----------

export function billingUpgradeTemplate({ name, planName, unsubscribeUrl }) {
  const bodyHtml = `<h1 style="margin:0 0 8px 0;font-size:22px;">Welcome to ${escape(planName)} 🚀</h1><p style="color:#374151;font-size:15px;">Thanks for upgrading, ${escape(name || 'friend')}. Your new plan is active.</p>`;
  return { subject: `Welcome to ${planName}`, html: shell({ title: 'Plan upgrade', preheader: 'Your upgrade is active.', bodyHtml, footerExtra: unsubscribeFooter(unsubscribeUrl) }), text: `You're now on ${planName}.` };
}
export function billingDowngradeTemplate({ name, planName, unsubscribeUrl }) {
  const bodyHtml = `<h1 style="margin:0 0 8px 0;font-size:22px;">Plan changed to ${escape(planName)}</h1><p style="color:#374151;font-size:15px;">Hi ${escape(name || 'friend')}, your SnapNext AI plan was updated to ${escape(planName)}.</p>`;
  return { subject: `Your SnapNext AI plan was changed`, html: shell({ title: 'Plan change', preheader: 'Plan downgrade confirmation.', bodyHtml, footerExtra: unsubscribeFooter(unsubscribeUrl) }), text: `Your plan was changed to ${planName}.` };
}
export function billingFailedTemplate({ name, retryUrl, unsubscribeUrl }) {
  const bodyHtml = `<h1 style="margin:0 0 8px 0;font-size:22px;">Payment failed</h1><p style="color:#374151;font-size:15px;">Hi ${escape(name || 'friend')}, we couldn't process your most recent payment. Please update your card to keep your plan active.</p>${retryUrl ? button('Update payment', retryUrl) : ''}`;
  return { subject: 'Payment failed — action required', html: shell({ title: 'Payment failed', preheader: 'Please update your billing details.', bodyHtml, footerExtra: unsubscribeFooter(unsubscribeUrl) }), text: 'Your payment failed.' };
}
export function downloadReadyTemplate({ name, downloadUrl, unsubscribeUrl }) {
  const bodyHtml = `<h1 style="margin:0 0 8px 0;font-size:22px;">Your export is ready 📦</h1><p style="color:#374151;font-size:15px;">Hi ${escape(name || 'friend')}, your SnapNext AI archive is ready to download.</p>${button('Download archive', downloadUrl)}<p style="color:#6b7280;font-size:12px;">This link is private to your account and expires in 7 days.</p>`;
  return { subject: 'Your SnapNext AI export is ready', html: shell({ title: 'Export ready', preheader: 'Your archive is ready to download.', bodyHtml, footerExtra: unsubscribeFooter(unsubscribeUrl) }), text: `Your export is ready: ${downloadUrl}` };
}
export function favoritesInviteTemplate({ name, fromName, acceptUrl, unsubscribeUrl }) {
  const bodyHtml = `<h1 style="margin:0 0 8px 0;font-size:22px;">${escape(fromName || 'Someone')} added you as a favorite 💖</h1><p style="color:#374151;font-size:15px;">Hi ${escape(name || 'there')}, accept to share memories you both appear in.</p>${button('Accept invite', acceptUrl)}`;
  return { subject: `${fromName || 'A friend'} added you as a favorite on SnapNext AI`, html: shell({ title: 'Favorite invitation', preheader: 'A favorites request is waiting.', bodyHtml, footerExtra: unsubscribeFooter(unsubscribeUrl) }), text: `Accept favorite invite: ${acceptUrl}` };
}
export function communityInviteTemplate({ name, communityName, acceptUrl, unsubscribeUrl }) {
  const bodyHtml = `<h1 style="margin:0 0 8px 0;font-size:22px;">You're invited to “${escape(communityName)}”</h1><p style="color:#374151;font-size:15px;">Hi ${escape(name || 'there')}, join this private SnapNext AI community to share memories.</p>${button('Open invitation', acceptUrl)}`;
  return { subject: `You're invited to ${communityName} on SnapNext AI`, html: shell({ title: 'Community invite', preheader: 'A new community invite is waiting.', bodyHtml, footerExtra: unsubscribeFooter(unsubscribeUrl) }), text: `Join community: ${acceptUrl}` };
}

export const TEMPLATE_REGISTRY = {
  verify_email: { fn: verifyEmailTemplate, transactional: true, prefKey: null },
  welcome: { fn: welcomeTemplate, transactional: true, prefKey: null },
  forgot_password: { fn: forgotPasswordTemplate, transactional: true, prefKey: null },
  password_changed: { fn: passwordChangedTemplate, transactional: true, prefKey: null },
  billing_upgrade: { fn: billingUpgradeTemplate, transactional: true, prefKey: null },
  billing_downgrade: { fn: billingDowngradeTemplate, transactional: true, prefKey: null },
  billing_failed: { fn: billingFailedTemplate, transactional: true, prefKey: null },
  download_ready: { fn: downloadReadyTemplate, transactional: true, prefKey: null },
  favorites_invite: { fn: favoritesInviteTemplate, transactional: false, prefKey: 'favorites' },
  community_invite: { fn: communityInviteTemplate, transactional: false, prefKey: 'community' },
};
