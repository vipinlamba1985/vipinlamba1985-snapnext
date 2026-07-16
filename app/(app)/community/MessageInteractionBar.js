'use client';

import { useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';

const REACTIONS = ['❤️', '😂', '😍', '👍', '🙏', '😮'];

export default function MessageInteractionBar({ message, currentUserId, onReply, onReact }) {
  const reactions = message?.reactions || {};
  const isSender = message?.senderId === currentUserId;
  const canEdit = isSender && !message?.deletedAt && message?.type !== 'sticker' && !message?.memories?.length;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message?.content || '');
  const [saving, setSaving] = useState(false);

  async function manage(action, content = '') {
    if (saving) return;
    setSaving(true);
    try {
      await apiFetch('/social-chat-message', {
        method: 'POST',
        body: JSON.stringify({ action, threadId: message.threadId, messageId: message.id, content }),
      });
      toast.success(action === 'edit' ? 'Message updated.' : 'Message deleted.');
      window.location.reload();
    } catch (error) {
      toast.error(error.message || 'Message could not be updated.');
      setSaving(false);
    }
  }

  async function deleteMessage() {
    const confirmed = window.confirm('Delete this message? Its text and shared attachments will be removed for everyone in this conversation.');
    if (confirmed) await manage('delete');
  }

  if (message?.deletedAt) {
    return <div className="mt-2 text-[11px] italic text-white/35">This message was deleted.</div>;
  }

  if (editing) {
    return (
      <div className="mt-3 rounded-2xl border border-pink-300/20 bg-black/25 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-black text-pink-200">Edit message</span>
          <button type="button" onClick={() => { setEditing(false); setDraft(message.content || ''); }} className="grid h-7 w-7 place-items-center rounded-full bg-white/5" aria-label="Cancel editing"><X className="h-3.5 w-3.5" /></button>
        </div>
        <textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none" />
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={() => { setEditing(false); setDraft(message.content || ''); }} className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-bold">Cancel</button>
          <button type="button" disabled={!draft.trim() || saving} onClick={() => manage('edit', draft.trim())} className="rounded-full bg-pink-500 px-3 py-1.5 text-xs font-black disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {Object.entries(reactions).map(([emoji, memberIds]) => {
        const users = Array.isArray(memberIds) ? memberIds : [];
        if (!users.length) return null;
        const active = users.includes(currentUserId);
        return <button key={emoji} type="button" onClick={() => onReact(message.id, emoji)} className={`rounded-full border px-2 py-1 text-xs font-bold ${active ? 'border-pink-300 bg-pink-500/20' : 'border-white/10 bg-white/5'}`}>{emoji} {users.length}</button>;
      })}

      <button type="button" onClick={() => onReply(message)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/65">Reply</button>

      <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-black/20 p-0.5">
        {REACTIONS.map(emoji => <button key={emoji} type="button" onClick={() => onReact(message.id, emoji)} className="grid h-7 w-7 place-items-center rounded-full text-sm hover:bg-white/10" aria-label={`React with ${emoji}`}>{emoji}</button>)}
      </div>

      {isSender && <div className="ml-1 flex items-center gap-1">
        {canEdit && <button type="button" onClick={() => setEditing(true)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5" aria-label="Edit message"><Pencil className="h-3.5 w-3.5" /></button>}
        <button type="button" onClick={deleteMessage} disabled={saving} className="grid h-8 w-8 place-items-center rounded-full border border-red-300/15 bg-red-500/10 text-red-200 disabled:opacity-40" aria-label="Delete message"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>}
    </div>
  );
}
