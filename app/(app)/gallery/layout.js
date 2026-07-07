'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function GalleryLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (pathname === '/gallery') router.replace('/magic-library');
  }, [pathname, router]);
  return children;
}
