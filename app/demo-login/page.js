'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Loader2 } from 'lucide-react';

export default function DemoLoginPage() {
  const router = useRouter();

  useEffect(() => {
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

    const next = new URLSearchParams(window.location.search).get('next') || '/dashboard';
    router.replace(next);
  }, [router]);

  return (
    <div className="min-h-screen grid place-items-center px-6 bg-[#0b0414] text-white">
      <div className="text-center">
        <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 grid place-items-center shadow-lg shadow-pink-500/30">
          <Camera className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold">Opening SnapNext preview</h1>
        <p className="mt-2 text-sm text-white/60">Creating a temporary demo session for review only.</p>
        <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-pink-300" />
      </div>
    </div>
  );
}
