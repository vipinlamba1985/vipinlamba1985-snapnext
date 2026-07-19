import { Loader2 } from 'lucide-react';

export default function CirclesLoading() {
  return <div className="grid min-h-[50vh] place-items-center"><div className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-pink-300" /><p className="mt-3 text-sm text-white/50">Opening your Circles…</p></div></div>;
}
