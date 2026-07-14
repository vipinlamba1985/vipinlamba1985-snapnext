const sections = [
  ['Adult responsibility', 'A Family Owner must be an authorized adult and is responsible for invitations, roles, plan management and appropriate supervision. Children should not create independent SnapNext accounts without the involvement and permission of a parent or legal guardian.'],
  ['Private libraries', 'Joining a Family does not automatically reveal a member’s personal library. Shared storage or AI allowances may be pooled, while personal photos, videos, memories and AI results remain private unless the member explicitly shares them.'],
  ['Invitations and roles', 'Invitations are tied to the invited email, expire, and may be cancelled or resent by the Owner. Adult and Child roles should receive only the permissions needed for their use. Removed members retain ownership of their personal files unless they separately delete them.'],
  ['Children’s data', 'SnapNext should collect and process only the information necessary to provide an authorized child experience. Optional face, relationship, location, voice and AI features require heightened care and may be restricted or disabled for child profiles.'],
  ['Face and sharing safeguards', 'Face-based organization or automatic sharing must not activate without appropriate consent and clear controls. Relationship labels are user-confirmed and must never be inferred as fact solely from facial similarity.'],
  ['Sharing safety', 'Adults should review recipients, album permissions and generated content before sharing children’s memories. SnapNext must not make child media public by default, and future community features must include reporting, blocking and permission controls.'],
  ['Safety enforcement', 'SnapNext prohibits exploitation, grooming, harassment, doxxing, threats and attempts to use the service to harm or locate a child. Serious reports may be preserved and escalated when required by law.'],
  ['Deletion and leaving a Family', 'Leaving or removal stops use of Family benefits but does not automatically delete personal content. Owners cannot silently take ownership of another member’s private library. Authorized deletion requests should remove relevant active data and indexes according to SnapNext’s retention process.'],
  ['Reporting and emergencies', 'Report child-safety concerns to safety@snapnext.ai. For immediate danger, contact local emergency services or the appropriate child-protection authority. SnapNext support is not an emergency service.'],
  ['Policy status', 'This is an operational launch policy. Age thresholds, parental-consent procedures and regional requirements will be finalized with qualified counsel before child-directed features are broadly released.'],
];

export const metadata = { title: 'Family & Child Safety · SnapNext AI' };

export default function FamilySafety() {
  return <main className="mx-auto max-w-4xl px-6 py-16 text-white/80">
    <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-200/70">Effective July 2026</p>
    <h1 className="mt-3 text-4xl font-black text-white">Family & Child Safety Policy</h1>
    <p className="mt-5 leading-7 text-white/60">SnapNext handles deeply personal family memories. This policy defines the safety principles for Family membership, child profiles and sharing.</p>
    <div className="mt-10 space-y-8">{sections.map(([title, body]) => <section key={title}><h2 className="text-xl font-black text-white">{title}</h2><p className="mt-2 leading-7 text-white/65">{body}</p></section>)}</div>
    <div className="mt-12 flex flex-wrap gap-3 text-sm"><a className="rounded-full border border-white/10 px-4 py-2" href="/privacy">Privacy</a><a className="rounded-full border border-white/10 px-4 py-2" href="/terms">Terms</a><a className="rounded-full border border-white/10 px-4 py-2" href="/ai-policy">AI Usage Policy</a></div>
  </main>;
}
