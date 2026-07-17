export const metadata = {
  title: 'Child Safety Standards — SnapNext AI',
  description: 'SnapNext AI standards for preventing child sexual abuse and exploitation.',
};

const standards = [
  ['Zero tolerance', 'SnapNext prohibits child sexual abuse and exploitation, grooming, sextortion, trafficking, sexualization of minors, and child sexual abuse material.'],
  ['Account-based communication', 'SnapNext does not provide anonymous or random stranger chat. Chat and community participation require an authenticated account and visible account identity.'],
  ['Report and response', 'Users can report safety concerns through the in-app Support area. SnapNext reviews reports, restricts access when necessary, preserves relevant evidence, and removes prohibited content after obtaining actual knowledge.'],
  ['Legal escalation', 'Confirmed child sexual abuse material is escalated to the appropriate regional authority, including the National Center for Missing & Exploited Children where legally applicable.'],
  ['Child-safety contact', 'Google Play and safety authorities may contact SnapNext at child-safety@snapnext.ai.'],
];

export default function ChildSafetyPage() {
  return (
    <main className="min-h-screen bg-[#0b0414] px-5 py-12 text-white">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">Safety standard</p>
          <h1 className="text-4xl font-bold">Child Safety Standards</h1>
          <p className="text-white/70">Effective July 17, 2026 · Applies to SnapNext chat, community, sharing and uploaded content.</p>
        </header>

        <section className="space-y-4">
          {standards.map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="mt-2 leading-7 text-white/75">{body}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-red-400/20 bg-red-400/10 p-5">
          <h2 className="text-xl font-semibold">Report an urgent concern</h2>
          <p className="mt-2 leading-7 text-white/80">Use the in-app Support page and select a safety concern. When a child may be in immediate danger, contact local emergency services or law enforcement first.</p>
          <a className="mt-4 inline-flex rounded-xl bg-white px-4 py-2 font-semibold text-black" href="/support">Open Support</a>
        </section>
      </article>
    </main>
  );
}
