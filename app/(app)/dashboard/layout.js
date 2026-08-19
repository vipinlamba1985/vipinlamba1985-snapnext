import FamilyWatchLauncher from '@/components/family/FamilyWatchLauncher';
import MagicHomeHighlight from '@/components/magic-library/MagicHomeHighlight';
import HomeWeatherWelcome from '@/components/home/HomeWeatherWelcome';

export default function DashboardLayout({ children }) {
  return (
    <div className="home-weather-layout">
      <HomeWeatherWelcome />
      <div className="mx-auto mt-5 max-w-5xl">
        <MagicHomeHighlight />
      </div>
      {children}
      <div className="mx-auto -mt-20 max-w-5xl pb-32 md:-mt-2 md:pb-12">
        <FamilyWatchLauncher mode="home" />
      </div>
      <style>{`
        .home-weather-layout [data-testid="home-personal-header"],
        .home-weather-layout [data-testid="home-story-carousel"] {
          display: none !important;
        }
        .home-weather-layout [data-testid="home-primary-action"] {
          padding: 1rem !important;
          border-radius: 1.5rem !important;
        }
        .home-weather-layout [data-testid="home-primary-action"] h2 {
          margin-top: .55rem !important;
          font-size: 1.125rem !important;
          line-height: 1.4 !important;
        }
        .home-weather-layout [data-testid="home-primary-action"] p {
          margin-top: .3rem !important;
          font-size: .75rem !important;
          line-height: 1.25rem !important;
        }
        .home-weather-layout [data-testid="home-primary-action-cta"] {
          margin-top: .75rem !important;
          min-height: 2.5rem !important;
          padding-left: 1rem !important;
          padding-right: 1rem !important;
          font-size: .75rem !important;
        }
      `}</style>
    </div>
  );
}
