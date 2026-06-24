import { LifeBuoy, Mail } from 'lucide-react';

export default function Support() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Support</h1>
        <p className="text-white/60 mt-1">We're here to help.</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-3 mb-3"><LifeBuoy className="h-5 w-5 text-pink-300"/><div className="text-lg font-semibold">Contact us</div></div>
        <p className="text-white/70 text-sm">Email <a className="text-pink-300 hover:underline" href="mailto:support@snapnext.ai">support@snapnext.ai</a> and we'll respond within one business day.</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="font-semibold mb-3">FAQ</div>
        <div className="space-y-3 text-sm">
          {[['How is my data stored?','We back up your photos in private storage. Only you can access them by default.'],['Can I cancel anytime?','Yes — from Billing.'],['Do you support iOS/Android natively?','SnapNext AI is a PWA today — install from your browser.'],['Does AI use my photos for training?','No.']].map(([q,a]) => (
            <details key={q} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <summary className="cursor-pointer font-medium">{q}</summary>
              <p className="mt-2 text-white/70">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
