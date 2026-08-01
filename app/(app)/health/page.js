import { redirect } from 'next/navigation';

// "Memory Health" used to be its own page, but it never scanned anything: the
// buckets were hardcoded literals, the scan was a two-second timer, and the fix
// button reported "space was reclaimed" without deleting a file. The real
// version of this feature already exists at /gallery/cleanup, backed by
// lib/triage.js and /api/triage, which counts actual duplicates and actually
// moves items to Trash.
//
// Rather than keep a second cleanup surface, this route now sends people to the
// one that works. Old links, bookmarks and the dashboard card keep working.
export default function MemoryHealthRedirectPage() {
  redirect('/gallery/cleanup');
}
