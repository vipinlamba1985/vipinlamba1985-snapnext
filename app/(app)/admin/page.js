'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import { Activity, Crown, Shield, ShieldCheck } from 'lucide-react';

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  async function load() {
    try { const d = await apiFetch('/admin/users'); setUsers(d.users || []); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function grant(id) {
    await apiFetch('/admin/grant-super', { method:'POST', body: JSON.stringify({ userId: id })});
    toast.success('Granted Super User');
    load();
  }

  if (error) return <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm">Admin access required. {error}</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2"><Shield className="h-5 w-5 text-amber-300"/> <h1 className="text-3xl font-bold">Admin</h1></div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/admin/operations" className="text-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-cyan-400/10 border border-cyan-300/20 text-cyan-100 hover:bg-cyan-400/20"><Activity className="h-3.5 w-3.5"/> Launch operations →</a>
          <a href="/admin/storage-audit" className="text-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-300/20 text-emerald-100 hover:bg-emerald-400/20"><ShieldCheck className="h-3.5 w-3.5"/> Storage & People audit →</a>
          <a href="/admin/billing" className="text-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">Billing health →</a>
          <a href="/admin/storage" className="text-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">Storage health →</a>
          <a href="/admin/emails" className="text-sm inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">Email log →</a>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="px-4 py-3 text-sm font-medium border-b border-white/5">Users ({users.length})</div>
        <div className="divide-y divide-white/5">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <div className="h-9 w-9 rounded-full grid place-items-center text-sm font-bold" style={{background: u.avatarColor}}>{u.name?.[0]?.toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{u.name}</div>
                <div className="text-xs text-white/50">{u.email} · {u.plan}{u.role === 'admin' && ' · admin'}</div>
              </div>
              {(u.plan !== 'super_user') && (
                <button onClick={()=>grant(u.id)} className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-rose-500"><Crown className="h-3 w-3"/> Grant Super</button>
              )}
              {u.plan === 'super_user' && <span className="text-xs text-amber-300 inline-flex items-center gap-1"><Crown className="h-3 w-3"/>Super User</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
