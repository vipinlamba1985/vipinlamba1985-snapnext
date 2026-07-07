import Link from 'next/link';
import { ScanFace } from 'lucide-react';

export default function PeopleSearchShortcut() {
  return (
    <Link href="/magic-library" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white/75 hover:bg-white/10">
      <ScanFace className="h-4 w-4 text-pink-300" /> Activate People Search
    </Link>
  );
}
