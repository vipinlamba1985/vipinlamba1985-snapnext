import { redirect } from 'next/navigation';

// "All photos" is the Library's All tab now, so there is a single place that
// means "everything I own" instead of three overlapping ones.
export default function MagicLibraryAllRedirectPage() {
  redirect('/gallery');
}
