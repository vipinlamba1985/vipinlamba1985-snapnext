'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function GalleryLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  return children;
}
