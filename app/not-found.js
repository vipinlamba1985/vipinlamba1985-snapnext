'use client';

import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0b0414] text-white flex flex-col items-center justify-center p-4 text-center">
      <BrandLogo size={72} className="mb-6" priority />
      <h2 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent mb-2">
        404 — Page Not Found
      </h2>
      <p className="text-white/60 mb-6 max-w-md text-sm">
        The memory or page you are looking for does not exist, or has been moved to a different vault.
      </p>
      <Link
        href="/dashboard"
        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 font-semibold text-sm transition text-white shadow-lg shadow-pink-500/20"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
