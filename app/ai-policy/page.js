const sections = [
  ['Purpose', 'SnapNext AI helps users organize, search, understand and create from their own saved memories. It is not a general authority about a person’s life and should not invent facts that are not supported by the user’s library.'],
  ['Grounding and sources', 'LifeGPT and grounded stories should use retrieved source memories and confirmed labels. Narrative answers are checked for valid source references. If validation fails or providers are unavailable, SnapNext may return deterministic Memory Brain results instead.'],
  ['User review', 'AI can make mistakes. Review names, dates, relationships, captions, stories, cleanup recommendations and generated content before relying on, deleting, publishing or sharing anything.'],
  ['Credits and failures', 'Search using existing indexes and confirmed metadata may cost zero AI Credits. External generation may consume credits. Credits are reserved before supported requests and should be released or refunded when a provider failure is verified.'],
  ['Provider processing', 'SnapNext may route a task to configured commercial AI providers. The system sends only the input reasonably needed for that task and records operational cost and quality metrics without placing private media or prompts into the LifeGPT audit dashboard.'],
  ['Safety controls', 'SnapNext may block or limit requests involving exploitation, unlawful activity, serious harm, abusive automation, attempts to bypass safeguards or other prohibited content. Provider-independent safety controls may be used in addition to provider moderation.'],
  ['User corrections', 'Users can mark LifeGPT responses Helpful or Incorrect. Corrections are recorded for quality review but do not silently rename people, change relationships, alter original media or modify private events.'],
  ['Financial safety', 'Company-wide spending caps, user allowances, rate limits, provider switches and feature kill switches protect service sustainability. If external AI is paused, uploads, downloads, browsing and saved memories should remain available.'],
  ['No professional advice', 'AI output is not legal, medical, financial, psychological, emergency or other professional advice. Do not use SnapNext AI for decisions where an error could cause serious harm.'],
  ['Reporting', 'Report unsafe, inaccurate or abusive AI behavior to safety@snapnext.ai.'],
];

export const metadata = { title: 'AI Usage Policy · SnapNext AI' };

export default function AiPolicy() {
  return <main className="mx-auto max-w-4xl px-6 py-16 text-white/80">
    <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200/70">Effective July 2026</p>
    <h1 className="mt-3 text-4xl font-black text-white">AI Usage Policy</h1>
    <p className="mt-5 leading-7 text-white/60">This policy explains how SnapNext’s intelligence features are intended to behave and the responsibilities users have when reviewing AI output.</p>
    <div className="mt-10 space-y-8">{sections.map(([title, body]) => <section key={title}><h2 className="text-xl font-black text-white">{title}</h2><p className="mt-2 leading-7 text-white/65">{body}</p></section>)}</div>
    <div className="mt-12 flex flex-wrap gap-3 text-sm"><a className="rounded-full border border-white/10 px-4 py-2" href="/privacy">Privacy</a><a className="rounded-full border border-white/10 px-4 py-2" href="/terms">Terms</a><a className="rounded-full border border-white/10 px-4 py-2" href="/family-safety">Family & Child Safety</a></div>
  </main>;
}
