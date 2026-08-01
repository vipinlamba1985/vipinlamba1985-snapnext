import { redirect } from 'next/navigation';

// /gallery/classic existed only as an escape hatch while /gallery force-
// redirected to the Magic Library. /gallery is that plain view again, so this
// alias would just be a third door into the same room.
export default function GalleryClassicRedirectPage() {
  redirect('/gallery');
}
