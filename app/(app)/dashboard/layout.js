import FamilyWatchLauncher from '@/components/family/FamilyWatchLauncher';

export default function DashboardLayout({ children }) {
  return (
    <>
      {children}
      <div className="mx-auto -mt-20 max-w-5xl pb-32 md:-mt-2 md:pb-12">
        <FamilyWatchLauncher mode="home" />
      </div>
    </>
  );
}
