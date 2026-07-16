'use client';

const REACTIONS = ['❤️', '😂', '😍', '👍', '🙏', '😮'];

export default function MessageInteractionBar({ message, currentUserId, onReply, onReact }) {
  const reactions = message?.reactions || {};

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {Object.entries(reactions).map(([emoji, memberIds]) => {
        const users = Array.isArray(memberIds) ? memberIds : [];
        if (!users.length) return null;
        const active = users.includes(currentUserId);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(message.id, emoji)}
            className={`rounded-full border px-2 py-1 text-xs font-bold ${active ? 'border-pink-300 bg-pink-500/20' : 'border-white/10 bg-white/5'}`}
            aria-label={`React ${emoji}`}
          >
            {emoji} {users.length}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onReply(message)}
        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/65"
      >
        Reply
      </button>

      <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-black/20 p-0.5">
        {REACTIONS.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(message.id, emoji)}
            className="grid h-7 w-7 place-items-center rounded-full text-sm hover:bg-white/10"
            aria-label={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
