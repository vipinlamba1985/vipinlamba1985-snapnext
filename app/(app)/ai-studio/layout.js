import Link from 'next/link';
import { Image as ImageIcon, SlidersHorizontal, Sparkles, WandSparkles } from 'lucide-react';

export default function AiStudioLayout({ children }) {
  return (
    <div className="space-y-5">
      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-2">
        <Link href="/ai-studio" className="inline-flex whitespace-nowrap items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white"><Sparkles className="h-4 w-4"/> Social Creator</Link>
        <Link href="/ai-studio/image" className="inline-flex whitespace-nowrap items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 px-4 py-2 text-sm font-bold text-cyan-100 hover:from-cyan-500/30 hover:to-purple-500/30"><ImageIcon className="h-4 w-4"/> Create Image</Link>
        <Link href="/ai-studio/enhance" className="inline-flex whitespace-nowrap items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 px-4 py-2 text-sm font-bold text-emerald-100 hover:from-emerald-500/30 hover:to-cyan-500/30"><SlidersHorizontal className="h-4 w-4"/> Enhance Photo <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">New</span></Link>
        <Link href="/ai-studio/avatar-motion" className="inline-flex whitespace-nowrap items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500/20 to-purple-500/20 px-4 py-2 text-sm font-bold text-pink-100 hover:from-pink-500/30 hover:to-purple-500/30"><WandSparkles className="h-4 w-4"/> Avatars & Motion</Link>
      </nav>
      {children}
    </div>
  );
}
