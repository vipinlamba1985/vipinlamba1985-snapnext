import FacePrivacyControls from '@/components/privacy/FacePrivacyControls';

export const metadata = { title: 'Privacy & security · SnapNext' };

export default function PrivacySecurityPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-32 md:pb-12">
      <header className="rounded-[2rem] border border-white/8 bg-gradient-to-br from-white/[0.055] to-white/[0.02] p-5 md:p-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">Privacy & security</p>
        <h1 className="mt-2 text-2xl font-black md:text-3xl">Face processing controls</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">Control on-device face detection and Favourite People cloud matching independently. Cloud matching is limited to the people you explicitly choose. Revoking it stops future processing; deleting stored recognition data is a separate verified action.</p>
      </header>
      <FacePrivacyControls />
    </div>
  );
}
