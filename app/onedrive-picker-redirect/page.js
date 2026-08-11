import Script from 'next/script';

export const metadata = { title: 'OneDrive Picker · SnapNext' };

export default function OneDrivePickerRedirectPage() {
  return (
    <main className="min-h-screen bg-[#0b0414] text-white">
      <Script src="https://js.live.net/v7.2/OneDrive.js" strategy="beforeInteractive" />
      <div className="sr-only" aria-live="polite">Returning from OneDrive to SnapNext.</div>
    </main>
  );
}
