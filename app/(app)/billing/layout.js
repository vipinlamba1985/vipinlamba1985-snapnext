import Link from 'next/link';
import AiCreditAccountability from '@/components/AiCreditAccountability';

export default function BillingLayout({ children }) {
  return (
    <div className="space-y-6">
      <AiCreditAccountability />
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-white/65">
        Family subscribers can manage up to six separate accounts, invitations, and the shared household AI balance from the <Link href="/family" className="font-bold text-cyan-200">Family workspace</Link>. Personal libraries stay private by default.
      </div>
      {children}
    </div>
  );
}
