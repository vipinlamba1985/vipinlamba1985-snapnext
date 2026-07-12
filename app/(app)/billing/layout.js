import AiCreditAccountability from '@/components/AiCreditAccountability';

export default function BillingLayout({ children }) {
  return (
    <div className="space-y-6">
      <AiCreditAccountability />
      {children}
    </div>
  );
}
