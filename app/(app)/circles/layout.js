import Link from 'next/link';

export default function CirclesLayout({ children }) {
  return <div className="space-y-5">
    <nav aria-label="Circles workspace" className="flex w-fit gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
      <Link href="/circles" className="rounded-full px-4 py-2 text-xs font-semibold text-white/65 hover:bg-white/10 hover:text-white">Sources</Link>
      <Link href="/circles/organize" className="rounded-full bg-gradient-to-r from-pink-500/25 to-purple-500/25 px-4 py-2 text-xs font-semibold text-white">Attention Organizer</Link>
    </nav>
    {children}
  </div>;
}
