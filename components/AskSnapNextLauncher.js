'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, Sparkles } from 'lucide-react';

export default function AskSnapNextLauncher() {
  const pathname = usePathname();
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return null;

  return (
    <Link
      data-testid="ask-snapnext-launcher"
      href="/chat"
      aria-label="Ask SnapNext"
      className="fixed bottom-28 right-4 z-30 inline-flex min-h-11 items-center gap-2 rounded-full border border-pink-300/20 bg-[#160b24]/92 px-3.5 py-2.5 text-xs font-black text-white shadow-2xl shadow-black/40 backdrop-blur-xl transition hover:border-pink-300/35 hover:bg-[#211033] md:bottom-7 md:right-8"
    >
      <span className="relative grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600">
        <MessageCircle className="h-3.5 w-3.5" />
        <Sparkles className="absolute -right-1 -top-1 h-2.5 w-2.5 text-cyan-200" />
      </span>
      <span>Ask SnapNext</span>
    </Link>
  );
}
