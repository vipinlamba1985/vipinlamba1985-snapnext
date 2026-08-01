import { redirect } from 'next/navigation';

// Magic Library is now the "Magic" tab of the Library rather than a separate
// destination. Old links and bookmarks keep working.
export default function MagicLibraryRedirectPage() {
  redirect('/gallery/magic');
}
