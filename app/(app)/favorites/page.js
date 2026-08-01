import { redirect } from 'next/navigation';

// The people-sharing feature is now called "Trusted circle" so it is no longer
// confused with starred photos (`media.favorite`). Older invitation emails and
// bookmarks still point at /favorites, so keep sending them to the new home.
export default function FavoritesRedirectPage() {
  redirect('/trusted-circle');
}
