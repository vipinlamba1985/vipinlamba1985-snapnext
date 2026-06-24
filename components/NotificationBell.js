'use client';
import { useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, Heart, Image as ImageIcon, FolderOpen, Mail, CreditCard, Download, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

const TYPE_META = {
  favorite_request:   { icon: Heart,      color: 'text-pink-300' },
  favorite_accepted:  { icon: Heart,      color: 'text-emerald-300' },
  photos_shared:      { icon: ImageIcon,  color: 'text-fuchsia-300' },
  album_shared:       { icon: FolderOpen, color: 'text-violet-300' },
  memory_shared:      { icon: Sparkles,   color: 'text-amber-300' },
  memory_reaction:    { icon: Heart,      color: 'text-rose-300' },
  email_verification: { icon: Mail,       color: 'text-amber-300' },
  billing:            { icon: CreditCard, color: 'text-emerald-300' },
  download_ready:     { icon: Download,   color: 'text-sky-300' },
};

function timeAgo(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return Math.floor(d / 60) + 'm';
  if (d < 86400) return Math.floor(d / 3600) + 'h';
  if (d < 604800) return Math.floor(d / 86400) + 'd';
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);
  const lastSeen = useRef(0);

  async function load() {
    try {
      const d = await apiFetch('/notifications');
      setItems(d.items || []);
      setUnread(d.unread || 0);
    } catch {}
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 45000);   // poll every 45s
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    function onClick(e) { if (open && ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function markAll() {
    try { await apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify({}) }); setUnread(0); setItems(items.map((i) => ({ ...i, read: true }))); }
    catch (e) { toast.error(e.message); }
  }
  async function markOne(id) {
    try { await apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [id] }) }); setItems(items.map((i) => i.id === id ? { ...i, read: true } : i)); setUnread((u) => Math.max(0, u - 1)); }
    catch {}
  }

  function toggle() {
    setOpen((v) => !v);
    if (!open && unread > 0 && Date.now() - lastSeen.current > 2000) {
      lastSeen.current = Date.now();
      // mark visible-unread as read when opening
      const visibleUnread = items.filter((i) => !i.read).map((i) => i.id);
      if (visibleUnread.length) apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify({ ids: visibleUnread }) }).then(() => { setUnread(0); setItems(items.map((i) => ({ ...i, read: true }))); }).catch(() => {});
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} aria-label="Notifications" className="relative h-9 w-9 grid place-items-center rounded-xl hover:bg-white/5 transition">
        <Bell className="h-5 w-5 text-white/80"/>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-[10px] font-bold">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#0b0414]/95 backdrop-blur shadow-xl shadow-black/40 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <div className="text-sm font-semibold">Notifications</div>
            {items.length > 0 && (
              <button onClick={markAll} className="text-[11px] text-pink-300 hover:text-pink-200 inline-flex items-center gap-1"><CheckCheck className="h-3 w-3"/>Mark all read</button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-white/5">
            {items.length === 0 ? (
              <div className="p-8 text-center text-sm text-white/50">You're all caught up.</div>
            ) : items.map((n) => {
              const meta = TYPE_META[n.type] || { icon: Bell, color: 'text-white/70' };
              const Icon = meta.icon;
              return (
                <button key={n.id} onClick={() => markOne(n.id)} className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/[0.04] transition ${!n.read ? 'bg-pink-500/5' : ''}`}>
                  <div className={`h-8 w-8 grid place-items-center rounded-lg bg-white/5 ${meta.color}`}><Icon className="h-4 w-4"/></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm leading-snug">{n.title}</div>
                    {n.body && <div className="text-xs text-white/50 mt-0.5">{n.body}</div>}
                    <div className="text-[11px] text-white/40 mt-1">{timeAgo(n.createdAt)}</div>
                  </div>
                  {!n.read && <span className="h-2 w-2 rounded-full bg-pink-400 mt-2"/>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
