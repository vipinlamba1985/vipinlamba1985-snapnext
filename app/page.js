import CurrentLandingPage from '@/components/marketing/CurrentLandingPage';
import LivePricingPortal from '@/components/marketing/LivePricingPortal';

export default function MarketingLandingPage() {
  return (
    <>
      <style>{'#pricing[data-live-pricing-ready="true"] > div:not([data-snapnext-live-pricing]) { display: none !important; }'}</style>
      <CurrentLandingPage />
      <LivePricingPortal />
    </>
  );
}
