import MagicLibraryGalleryMagic from '@/components/magic-library/MagicLibraryGalleryMagic';
import PeopleMagicBootstrap from '@/components/magic-library/PeopleMagicBootstrap';
import PeopleLocalAnalysisBackfill from '@/components/magic-library/PeopleLocalAnalysisBackfill';
import LibraryTabs from '@/components/LibraryTabs';

export const metadata = { title: 'Magic Library · SnapNext' };

// The Magic view of the Library: the same photos you own, organised by person.
// It lives under /gallery because it is a lens over the library, not a second
// library. The "All" tab remains the complete, ungated view of everything.
export default function GalleryMagicPage() {
  return (
    <div className="mx-auto max-w-6xl pb-32 md:pb-12">
      <div className="mb-5"><LibraryTabs /></div>
      <PeopleLocalAnalysisBackfill />
      <PeopleMagicBootstrap />
      <MagicLibraryGalleryMagic />
    </div>
  );
}
