'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function UploadLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => { if (pathname === '/upload') router.replace('/upload/discover'); }, [pathname, router]);
  if (pathname === '/upload') return <div className="py-16 text-center text-sm text-white/45">Opening Discovery…</div>;
  return children;
}
