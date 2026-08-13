import FamilyWatchLauncher from '@/components/family/FamilyWatchLauncher';
import HomeWeatherWelcome from '@/components/home/HomeWeatherWelcome';

export default function DashboardLayout({ children }) {
  return (
    <div className="home-weather-layout">
      <HomeWeatherWelcome />
      {children}
      <div className="mx-auto -mt-20 max-w-5xl pb-32 md:-mt-2 md:pb-12">
        <FamilyWatchLauncher mode="home" />
      </div>
      <style>{`
        .home-weather-layout [data-testid="home-personal-header"] {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
