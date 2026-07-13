'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

export default function AiCreditSummaryLink() {
  const [data, setData] = useState(null);
  useEffect(() => { apiFetch('/ai/credits').then(setData).catch(() => {}); }, []);
  if (!data) return null;
  return <Link href="/billing" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70"><Sparkles className="h-3.5 w-3.5 text-pink-300" />{data.remainingCredits}/{data.weeklyCredits} AI Credits</Link>;
}
