import AiCreditAccountability from '@/components/AiCreditAccountability';
import FamilyPlanEntry from '@/components/FamilyPlanEntry';

export default function BillingLayout({ children }) {
  return (
    <div className="space-y-6">
      <AiCreditAccountability />
      <FamilyPlanEntry />
      {children}
    </div>
  );
}
