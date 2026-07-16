'use client';

import { Reply, X } from 'lucide-react';

export default function ReplyComposerBanner({ message, onCancel }) {
  if (!message) return null;

  const preview = message.content
    || (message.sticker ? 'Memory Sticker' : '')
    || (message.memories?.length ? 'Shared memory' : '')
    || 'Message';

  return (
    <div className="border-t border-white/10 bg-pink-500/10 px-4 py-3">
      <div className="flex items-start gap-3 rounded-2xl border border-pink-300/20 bg-black/20 p-3">
        <Reply className="mt-0.5 h-4 w-4 shrink-0 text-pink-200" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-black text-pink-200">
            Replying to {message.sender?.name || 'member'}
          </div>
          <div className="mt-0.5 truncate text-xs text-white/55">{preview}</div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5"
          aria-label="Cancel reply"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
