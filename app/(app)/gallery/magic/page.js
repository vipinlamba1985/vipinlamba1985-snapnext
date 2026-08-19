import LibraryTabs from '@/components/LibraryTabs';
import MagicManifestV1 from '@/components/magic-library/MagicManifestV1';

export const metadata = { title: 'Magic · Library · SnapNext' };

// Magic V1 is intentionally deterministic. The page only reads the persisted
// server-filtered manifest; opening it never runs face processing or paid AI.
export default function GalleryMagicPage() {
  return (
    <div className="mx-auto max-w-6xl pb-32 md:pb-12">
      <header className="mb-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-black tracking-tight">Library</h1>
            <p className="mt-0.5 text-sm text-white/45">Magic surfaces reliable highlights without replacing your complete library.</p>
          </div>
        </div>
        <div className="mt-4"><LibraryTabs /></div>
      </header>

      <main>
        <MagicManifestV1 />
      </main>
    </div>
  );
}
