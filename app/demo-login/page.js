'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

export default function DemoLoginPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Preview sessions are strictly non-production. The server decides.
        const res = await fetch('/api/auth/config');
        const cfg = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!cfg?.previewAllowed) {
          router.replace('/login');
          return;
        }

        const demoUser = {
          id: 'preview-super-user',
          name: 'Vipin Lamba',
          email: 'vipin.lamba1985@gmail.com',
          role: 'admin',
          plan: 'admin',
          storageUsed: 0,
          storageLimit: 10240,
          isPreview: true,
        };

        localStorage.setItem('snapnext_token', 'preview-demo-token');
        localStorage.setItem('snapnext_user', JSON.stringify(demoUser));
        localStorage.setItem('snapnext_access_token', 'preview-demo-token');
        localStorage.setItem('snapnext_profile', JSON.stringify(demoUser));
        document.cookie = 'sb-access-token=preview-demo-token; path=/; max-age=86400; SameSite=Lax';

        const next = new URLSearchParams(window.location.search).get('next') || '/dashboard';
        router.replace(next);
      } catch {
        if (!cancelled) router.replace('/login');
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="min-h-screen grid place-items-center px-6 bg-[#0b0414] text-white">
      <div className="text-center">
        <BrandLogo size={64} className="mx-auto mb-5" priority />
        <h1 className="text-2xl font-bold">Opening SnapNext preview</h1>
        <p className="mt-2 text-sm text-white/60">Creating a temporary demo session for review only.</p>
        <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-pink-300" />
      </div>
    </div>
  );
}
