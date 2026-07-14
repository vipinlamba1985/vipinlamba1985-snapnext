const sections = [
  ['Information we collect', 'We process account details, subscription and transaction references, device and diagnostic information, and the photos, videos, captions, labels, events and other content you choose to store or create in SnapNext. We collect only information needed to provide, secure, support and improve the service.'],
  ['How your media is used', 'Your media is private by default. We use it to provide backup, organization, search, Memory Brain, LifeGPT, Story Builder and features you request. SnapNext does not sell your personal information or use your private media to train public AI models.'],
  ['AI processing', 'When an AI feature requires an external provider, SnapNext may send the minimum necessary input to configured service providers under commercial API terms. Core uploads, downloads and browsing do not depend on AI availability. Generated results may be inaccurate, so grounded LifeGPT answers include source memories and validation controls.'],
  ['Sharing and Family', 'Personal libraries remain private unless you explicitly share content or join a shared space. Family membership may pool plan benefits such as storage or AI allowances, but it does not automatically expose each member’s personal library.'],
  ['Face and relationship information', 'Face organization and relationship labels are sensitive. SnapNext does not infer family relationships automatically. Relationship labels are saved only when you confirm them. Where biometric processing is offered, separate consent and deletion controls will apply before activation.'],
  ['Service providers', 'We use infrastructure, storage, authentication, payment, email, analytics and AI providers to operate SnapNext. Providers receive only the information necessary for their task and are subject to contractual and security controls. A current subprocessor list will be published before public launch.'],
  ['Security', 'We use encryption in transit, managed encryption at rest, scoped access controls, audit logging, rate limits and operational monitoring. No online service can promise absolute security, so we also maintain incident response and recovery procedures.'],
  ['Retention and deletion', 'You may delete individual memories or request account deletion. Access is revoked promptly and deletion is orchestrated across active databases, media storage, AI indexes, drafts and sharing records. Limited billing, fraud-prevention, security and backup records may remain temporarily where legally or operationally required.'],
  ['Your choices and rights', 'Depending on your location, you may request access, correction, export, deletion or restriction of certain processing. You may also disable optional AI or sharing features where available. We will verify requests before acting to protect your account.'],
  ['Children and families', 'SnapNext is not intended for children to create independent accounts without an authorized adult. Family and child features require appropriate adult control and must follow the Family & Child Safety Policy.'],
  ['Contact', 'Privacy requests and questions can be sent to privacy@snapnext.ai. Support requests can be sent to support@snapnext.ai.'],
];

export const metadata = { title: 'Privacy Policy · SnapNext AI' };

export default function Privacy() {
  return <main className="mx-auto max-w-4xl px-6 py-16 text-white/80">
    <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-200/70">Effective July 2026</p>
    <h1 className="mt-3 text-4xl font-black text-white">Privacy Policy</h1>
    <p className="mt-5 leading-7 text-white/60">SnapNext is designed as a private digital-life vault and memory intelligence service. This policy explains how information is handled. It is an operational launch draft and will receive final legal review before broad public release.</p>
    <div className="mt-10 space-y-8">{sections.map(([title, body]) => <section key={title}><h2 className="text-xl font-black text-white">{title}</h2><p className="mt-2 leading-7 text-white/65">{body}</p></section>)}</div>
    <div className="mt-12 flex flex-wrap gap-3 text-sm"><a className="rounded-full border border-white/10 px-4 py-2" href="/terms">Terms</a><a className="rounded-full border border-white/10 px-4 py-2" href="/ai-policy">AI Usage Policy</a><a className="rounded-full border border-white/10 px-4 py-2" href="/family-safety">Family & Child Safety</a></div>
  </main>;
}
