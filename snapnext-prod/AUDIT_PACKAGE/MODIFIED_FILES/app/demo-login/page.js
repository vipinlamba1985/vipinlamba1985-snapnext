'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

// -----------------------------------------------------------------------------
// SECURITY: /demo-login is a preview-only bootstrap route.
// -----------------------------------------------------------------------------
// It stores the `preview-demo-token` in localStorage so reviewers / internal QA
// can walk the authenticated shell without a real Supabase session.
//
// This route is a HARD launch blocker if it is reachable in production because
// it grants an app-level super-user identity to anyone who visits the URL.
//
// Rule: this route only executes its bypass logic when NODE_ENV !== 'production'.
// In production it renders a plain not-available screen and never touches
// localStorage or navigates the reviewer into the authenticated shell.
//
// The reviewer's on-device identity is generic; no real user name, email, or
// storage usage is ever persisted here.
// -----------------------------------------------------------------------------

const IS_PROD = process.env.NODE_ENV === 'production';

export default function DemoLoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (IS_PROD) return;

    const previewUser = {
      id: 'preview-super-user',
      name: 'Preview Reviewer',
      email: 'preview@snapnext.local',
      role: 'admin',
      plan: 'super_user',
      storageUsed: 0,
      storageLimit: 10240,
      isPreview: true,
    };

    try {
      localStorage.setItem('snapnext_token', 'preview-demo-token');
      localStorage.setItem('snapnext_user', JSON.stringify(previewUser));
      localStorage.setItem('snapnext_access_token', 'preview-demo-token');
      localStorage.setItem('snapnext_profile', JSON.stringify(previewUser));
    } catch {
      /* storage disabled — will show fallback UI */
    }

    const next = new URLSearchParams(window.location.search).get('next') || '/dashboard';
    router.replace(next);
  }, [router]);

  if (IS_PROD) {
    return (
      <div className="min-h-screen grid place-items-center px-6 bg-[#0b0414] text-white">
        <div className="max-w-sm text-center space-y-4">
          <BrandLogo size={64} className="mx-auto" priority />
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold">Preview mode is not available</h1>
          <p className="text-sm text-white/60 leading-relaxed">
            The demo shortcut is disabled in production for safety.
            Please sign in with your SnapNext account to continue.
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition"
          >
            Go to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center px-6 bg-[#0b0414] text-white">
      <div className="text-center">
        <BrandLogo size={64} className="mx-auto mb-5" priority />
        <h1 className="text-2xl font-bold">Opening SnapNext preview</h1>
        <p className="mt-2 text-sm text-white/60">Creating a temporary reviewer session (non-production).</p>
        <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-pink-300" />
      </div>
    </div>
  );
}
