const sections = [
  ['Your account', 'You are responsible for accurate registration information, protecting your credentials and activity performed through your account. You must promptly report suspected unauthorized access.'],
  ['Your content and ownership', 'You retain ownership of content you upload or create. You grant SnapNext a limited license to host, process, transform and display that content only as needed to operate features you request. You must have the rights and permissions needed for uploaded content.'],
  ['Acceptable use', 'Do not use SnapNext for unlawful activity, abuse, harassment, exploitation, infringement, malware, unauthorized surveillance, attempts to bypass limits, or content that creates serious safety risks. We may restrict accounts or features when necessary to protect users, the service or the law.'],
  ['Storage and backups', 'SnapNext is designed to protect memories, but no service can guarantee that data will never be lost. Keep independent copies of irreplaceable files. Upload, sync and restoration behavior may depend on network, device and platform limitations.'],
  ['AI features', 'AI results can be incomplete or inaccurate and should not be treated as professional, legal, medical, financial or emergency advice. LifeGPT and Story Builder are designed to use grounded sources, but users remain responsible for reviewing generated content before relying on or sharing it.'],
  ['Credits, plans and billing', 'Paid plans, storage and AI allowances are governed by the offer shown at purchase. Credits have no cash value unless applicable law requires otherwise. Failed AI generations should not be permanently charged where the system can verify failure. Web, Apple and Google purchases may be governed by different billing and refund rules.'],
  ['Family accounts and sharing', 'Family Owners manage invitations and plan participation. Membership does not transfer ownership of a member’s private files. Shared content and spaces may be visible to participants according to the permissions chosen by the user.'],
  ['Availability and changes', 'We may update, suspend or discontinue features to maintain security, reliability, legal compliance or financial sustainability. Core vault access is designed to remain available when optional AI providers are degraded or paused.'],
  ['Termination and deletion', 'You may stop using SnapNext and request deletion. We may suspend access for serious violations, fraud, attacks or nonpayment. Where possible, we will provide notice and a reasonable opportunity to export content unless immediate action is required for safety or law.'],
  ['Disclaimers and liability', 'SnapNext is provided on an as-available basis to the extent permitted by law. Liability limitations do not apply where prohibited, and nothing in these terms removes non-waivable consumer rights. Final jurisdiction, dispute and entity details will be completed with counsel before broad public launch.'],
  ['Contact', 'Questions about these terms can be sent to legal@snapnext.ai or support@snapnext.ai.'],
];

export const metadata = { title: 'Terms of Service · SnapNext AI' };

export default function Terms() {
  return <main className="mx-auto max-w-4xl px-6 py-16 text-white/80">
    <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-200/70">Effective July 2026</p>
    <h1 className="mt-3 text-4xl font-black text-white">Terms of Service</h1>
    <p className="mt-5 leading-7 text-white/60">These terms govern use of SnapNext. They are an operational launch draft and will receive final legal review before broad public release.</p>
    <div className="mt-10 space-y-8">{sections.map(([title, body]) => <section key={title}><h2 className="text-xl font-black text-white">{title}</h2><p className="mt-2 leading-7 text-white/65">{body}</p></section>)}</div>
    <div className="mt-12 flex flex-wrap gap-3 text-sm"><a className="rounded-full border border-white/10 px-4 py-2" href="/privacy">Privacy</a><a className="rounded-full border border-white/10 px-4 py-2" href="/ai-policy">AI Usage Policy</a><a className="rounded-full border border-white/10 px-4 py-2" href="/family-safety">Family & Child Safety</a></div>
  </main>;
}
