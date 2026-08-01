'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The Library has exactly two views, and they answer different questions:
//   All   — everything you own, newest first. Never gated, never filtered by
//           what recognition happened to find.
//   Magic — the same photos seen through people. Plan-gated on active people.
// Magic is a lens over the library, not a folder inside it and not a separate
// library, which is why both live under /gallery.
const TABS = [
  { href: '/gallery', label: 'All', hint: 'Everything you have backed up' },
  { href: '/gallery/magic', label: 'Magic', hint: 'Your photos, organised by person' },
];

export default function LibraryTabs() {
  const pathname = usePathname();
  const activeHref = pathname === '/gallery/magic' ? '/gallery/magic' : '/gallery';

  return (
    <div data-testid="library-tabs" role="tablist" aria-label="Library views" className="flex gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1">
      {TABS.map(tab => {
        const active = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            title={tab.hint}
            data-testid={`library-tab-${tab.label.toLowerCase()}`}
            className={`min-h-10 flex-1 rounded-full px-5 text-center text-sm font-black leading-10 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 ${active ? 'bg-white text-black' : 'text-white/55 hover:text-white/80'}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
