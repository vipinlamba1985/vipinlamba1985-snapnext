import FamilyWatchLauncher from '@/components/family/FamilyWatchLauncher';

export default function MemoryStoriesLayout({ children }) {
  return (
    <>
      {children}
      <div className="mx-auto -mt-16 max-w-6xl pb-24">
        <FamilyWatchLauncher mode="story" />
      </div>
    </>
  );
}
