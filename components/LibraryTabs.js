'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Search } from 'lucide-react';

// Library keeps exactly two primary lenses. Collections and Search are
// secondary Library header actions, never primary/bottom navigation items.
const TABS = [
  { href: '/gallery', label: 'All', hint: 'Everything you have backed up' },
  { href: '/gallery/magic', label: 'Magic', hint: 'Highlights prepared from your library' },
];

const ACTIONS = [
  { href: '/gallery/collections', label: 'Collections', icon: LayoutGrid },
  { href: '/gallery/search', label: 'Search', icon: Search },
];

export default function LibraryTabs() {
  const pathname = usePathname();
  const activeHref = pathname === '/gallery' || pathname === '/gallery/'
    ? '/gallery'
    : pathname === '/gallery/magic' || pathname.startsWith('/gallery/magic/')
      ? '/gallery/magic'
      : null;

  return (
    <div data-testid="library-navigation" className="space-y-3">
      <div className="flex items-center justify-end gap-2" aria-label="Library tools">
        {ACTIONS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              data-testid={`library-action-${label.toLowerCase()}`}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-300 ${active ? 'border-pink-400/35 bg-pink-500/12 text-pink-100' : 'border-white/10 bg-white/[0.035] text-white/60 hover:text-white/85'}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>

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
    </div>
  );
}
