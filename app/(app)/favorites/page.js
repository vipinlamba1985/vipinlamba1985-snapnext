'use client';
import { useEffect, useState } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { Heart, UserPlus, Check, X, Loader2, Mail, ShieldCheck, ImageIcon, FolderPlus, Trash2, ExternalLink, Send, Sparkles } from 'lucide-react';

const PERM_LABELS = {
  shareSharedPhotos: 'Allow sharing individual photos',
  shareAlbums: 'Allow sharing albums',
  shareMemories: 'Allow sharing memory stories',
  shareFuturePhotos: 'Auto-share future uploads (off by default)',
  shareProfilePicture: 'Show my profile picture',
};

export default function FavoritesPage() {
  const [data, setData] = useState({ accepted: [], incoming: [], outgoing: [], blocked: [] });
  const [albums, setAlbums] = useState({ owned: [], shared: [] });
  const [sharedPhotos, setSharedPhotos] = useState([]);
  const [memories, setMemories] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState('');
  const [permsFor, setPermsFor] = useState(null);
  const [perms, setPerms] = useState(null);
  const [shareFor, setShareFor] = useState(null);
  const [myPhotos, setMyPhotos] = useState([]);
  const [selectedPhotos, setSelectedPhotos] = useState(new Set());
  const [newAlbumName, setNewAlbumName] = useState('');
  const [aiInsights, setAiInsights] = useState(null);
 
  async function load() {
    try {
      const [f, a, sp, sm, ai] = await Promise.all([
        apiFetch('/favorites'),
        apiFetch('/shared/albums'),
        apiFetch('/shared/photos'),
        apiFetch('/shared/memories'),
        apiFetch('/favorites/ai').catch(() => null),
      ]);
      setData(f); setAlbums(a); setSharedPhotos(sp.items || []); setMemories(sm.memories || []);
      if (ai) setAiInsights(ai);
    } catch (e) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function invite(e) {
    e?.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy('invite');
    try {
      const r = await apiFetch('/favorites/invite', { method: 'POST', body: JSON.stringify({ email: inviteEmail }) });
      if (r.alreadyFavorites) toast('Already favorites');
      else if (r.alreadyPending) toast('Request already pending');
      else toast.success('Favorite request sent');
      setInviteEmail('');
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(''); }
  }
  async function favAction(id, action) {
    setBusy(`${id}-${action}`);
    try { await apiFetch(`/favorites/${id}/${action}`, { method: 'POST' }); load(); toast.success(action[0].toUpperCase() + action.slice(1)); }
    catch (e) { toast.error(e.message); }
    finally { setBusy(''); }
  }
  async function openPerms(fav) {
    setPermsFor(fav); setPerms(null);
    try { const r = await apiFetch(`/favorites/${fav.id}/permissions`); setPerms(r.perms); }
    catch (e) { toast.error(e.message); }
  }
  async function togglePerm(key) {
    const next = { ...perms, [key]: !perms[key] };
    setPerms(next);
    try { await apiFetch(`/favorites/${permsFor.id}/permissions`, { method: 'PUT', body: JSON.stringify({ [key]: next[key] }) }); }
    catch (e) { toast.error(e.message); setPerms(perms); }
  }
  async function openShare(fav) {
    setShareFor(fav); setSelectedPhotos(new Set());
    if (myPhotos.length === 0) {
      const d = await apiFetch('/media?filter=photo');
      setMyPhotos(d.items?.slice(0, 48) || []);
    }
  }
  async function doSharePhotos() {
    if (!selectedPhotos.size) return;
    setBusy('share');
    try {
      await apiFetch('/shared/photos', { method: 'POST', body: JSON.stringify({ mediaIds: [...selectedPhotos], recipientUserId: shareFor.other.id }) });
      toast.success(`Shared ${selectedPhotos.size} photo${selectedPhotos.size === 1 ? '' : 's'}`);
      setShareFor(null); setSelectedPhotos(new Set());
      load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(''); }
  }
  async function createAlbum(e) {
    e?.preventDefault();
    if (!newAlbumName.trim()) return;
    try { await apiFetch('/shared/albums', { method: 'POST', body: JSON.stringify({ name: newAlbumName }) }); setNewAlbumName(''); load(); toast.success('Album created'); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Heart className="h-7 w-7 text-pink-400"/> Favorites</h1>
        <p className="text-white/60 mt-1">Trusted people you choose to share memories with. <strong>Nothing is shared until you say so.</strong></p>
      </div>

      {/* Favorites AI Co-Processor Panel */}
      {aiInsights && (
        <section className="rounded-3xl border border-pink-500/20 bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-transparent p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-pink-300 flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-pink-300" /> AI Relationship Insights
            </h2>
            <span className="text-[10px] bg-pink-500/25 px-2.5 py-0.5 rounded-full text-white font-medium">
              Core Brain active
            </span>
          </div>

          <div className="grid md:grid-cols-[1fr_280px] gap-6">
            <div className="space-y-3">
              <p className="text-sm text-white/90 leading-relaxed italic font-medium">
                “{aiInsights.relationshipHighlights || "Analyzing relationships from faces found in uploaded memory photos..."}”
              </p>
              
              {aiInsights.suggestions && aiInsights.suggestions.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider block">Suggestions:</span>
                  {aiInsights.suggestions.map((s, i) => (
                    <p key={i} className="text-xs text-white/70 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-pink-400"></span>
                      {s}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Favorite People / Most Seen Faces list */}
            <div className="border-l border-white/10 pl-6 space-y-3">
              <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider block">Frequently Seen Faces:</span>
              {aiInsights.favoritePeople && aiInsights.favoritePeople.length > 0 ? (
                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-2 no-scrollbar">
                  {aiInsights.favoritePeople.slice(0, 4).map((person, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
                      <span className="font-semibold text-white/90">{person.name}</span>
                      <span className="text-[10px] text-pink-300 bg-pink-500/10 px-2 py-0.5 rounded-md">
                        {person.count} photos
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/45">No faces identified yet. Upload photos to start tracking relationships.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Invite */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-sm font-medium mb-3 flex items-center gap-2"><UserPlus className="h-4 w-4 text-pink-300"/> Add a favorite</div>
        <form onSubmit={invite} className="flex flex-wrap gap-2">
          <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="friend@snapnext.ai" className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:border-pink-400/50 text-sm" />
          <button disabled={busy === 'invite' || !inviteEmail.trim()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 font-medium text-sm disabled:opacity-60">
            {busy === 'invite' ? <Loader2 className="h-4 w-4 animate-spin"/> : <Mail className="h-4 w-4"/>} Send request
          </button>
        </form>
        <p className="text-xs text-white/50 mt-2">They must have a SnapNext AI account. They'll be notified to accept.</p>
      </section>

      {/* Incoming */}
      {data.incoming.length > 0 && (
        <Section title="Pending requests" subtitle="People who want to be your favorite">
          <div className="space-y-2">
            {data.incoming.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3">
                <Avatar u={f.other}/>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{f.other.name}</div><div className="text-xs text-white/50 truncate">{f.other.email}</div></div>
                <button onClick={() => favAction(f.id, 'decline')} disabled={busy === f.id+'-decline'} className="text-sm px-3 py-1.5 rounded-full bg-white/5 border border-white/10"><X className="h-3.5 w-3.5 inline mr-1"/>Decline</button>
                <button onClick={() => favAction(f.id, 'accept')} disabled={busy === f.id+'-accept'} className="text-sm px-3 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium"><Check className="h-3.5 w-3.5 inline mr-1"/>Accept</button>
              </div>
            ))}
          </div>
        </Section>
      )}
      {data.outgoing.length > 0 && (
        <Section title="Sent invitations" subtitle="Waiting for response">
          <div className="space-y-2">
            {data.outgoing.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <Avatar u={f.other}/>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium">{f.other.name}</div><div className="text-xs text-white/50">{f.other.email}</div></div>
                <span className="text-xs text-white/50">Pending</span>
                <button onClick={() => favAction(f.id, 'cancel')} className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10">Cancel</button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Accepted */}
      <Section title="My favorites" subtitle={`${data.accepted.length} trusted ${data.accepted.length === 1 ? 'person' : 'people'}`}>
        {data.accepted.length === 0 ? (
          <Empty label="No favorites yet. Invite someone above to get started."/>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {data.accepted.map((f) => (
              <div key={f.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-3">
                <Avatar u={f.other} lg/>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{f.other.name}</div>
                  <div className="text-xs text-white/50 truncate">{f.other.email}</div>
                </div>
                <button onClick={() => openShare(f)} className="text-sm px-3 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium"><Send className="h-3.5 w-3.5 inline mr-1"/>Share</button>
                <button onClick={() => openPerms(f)} className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10"><ShieldCheck className="h-3.5 w-3.5 inline mr-1"/>Perms</button>
                <button onClick={() => favAction(f.id, 'remove')} className="text-xs text-rose-300 hover:text-rose-200 p-1.5" title="Remove"><Trash2 className="h-3.5 w-3.5"/></button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Shared with you */}
      {sharedPhotos.length > 0 && (
        <Section title="Photos shared with you" subtitle={`${sharedPhotos.length} ${sharedPhotos.length === 1 ? 'photo' : 'photos'}`}>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {sharedPhotos.map((s) => (
              <div key={s.id} className="relative aspect-square rounded-xl overflow-hidden bg-white/5">
                <img src={mediaSrc(s.media.id)} className="absolute inset-0 h-full w-full object-cover" alt=""/>
                <div className="absolute bottom-1 left-1 right-1 text-[10px] bg-black/60 px-1.5 py-0.5 rounded truncate">From {s.owner?.name}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Albums */}
      <Section title="Shared albums" subtitle="Create an album and invite favorites to view">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-3">
          <form onSubmit={createAlbum} className="flex gap-2">
            <input value={newAlbumName} onChange={(e) => setNewAlbumName(e.target.value)} placeholder="Weekend in Lisbon" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 outline-none focus:border-pink-400/50 text-sm"/>
            <button className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-sm"><FolderPlus className="h-4 w-4"/>Create album</button>
          </form>
        </div>
        {(albums.owned.length === 0 && albums.shared.length === 0) ? <Empty label="No albums yet."/> : (
          <div className="grid md:grid-cols-3 gap-3">
            {[...albums.owned.map(a => ({...a, mine: true})), ...albums.shared.map(a => ({...a, mine: false}))].map((a) => (
              <a key={a.id} href={`/favorites/album/${a.id}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition">
                <div className="text-sm font-medium">{a.name}</div>
                <div className="text-xs text-white/50 mt-1">{a.mine ? 'You created' : 'Shared with you'} · {new Date(a.createdAt).toLocaleDateString()}</div>
                <div className="mt-3 text-xs text-pink-300 inline-flex items-center gap-1">Open <ExternalLink className="h-3 w-3"/></div>
              </a>
            ))}
          </div>
        )}
      </Section>

      {/* Memories */}
      {memories.length > 0 && (
        <Section title="Memories shared with you" subtitle={`${memories.length} stories`}>
          <div className="space-y-3">
            {memories.map((m) => (
              <div key={m.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm font-medium">{m.title}</div>
                <div className="text-xs text-white/50">From {m.owner?.name} · {new Date(m.sharedAt).toLocaleDateString()}</div>
                <div className="mt-3 grid grid-cols-4 md:grid-cols-8 gap-2">
                  {m.mediaItems.slice(0, 8).map((mi) => (
                    <div key={mi.id} className="aspect-square rounded-lg overflow-hidden bg-white/5"><img src={mediaSrc(mi.id)} className="h-full w-full object-cover" alt=""/></div>
                  ))}
                </div>
                <button onClick={() => apiFetch(`/shared/memories/${m.id}/react`, { method:'POST', body: JSON.stringify({ emoji: '❤️' })}).then(() => toast.success('Reacted ❤️'))} className="mt-3 text-sm px-3 py-1.5 rounded-full bg-white/5 border border-white/10">❤️ React</button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Permissions modal */}
      {permsFor && (
        <Modal onClose={() => setPermsFor(null)}>
          <div className="text-lg font-semibold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-300"/> Permissions for {permsFor.other.name}</div>
          <p className="text-xs text-white/50 mt-1">You control what YOU share with them. Nothing is shared until you explicitly share it.</p>
          {!perms ? <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto"/></div> : (
            <div className="mt-4 space-y-3">
              {Object.entries(PERM_LABELS).map(([k, label]) => (
                <label key={k} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{label}</span>
                  <button onClick={() => togglePerm(k)} className={`relative h-6 w-11 rounded-full ${perms[k] ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'bg-white/15'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${perms[k] ? 'left-[22px]' : 'left-0.5'}`}/>
                  </button>
                </label>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Share photos modal */}
      {shareFor && (
        <Modal onClose={() => setShareFor(null)}>
          <div className="text-lg font-semibold">Share photos with {shareFor.other.name}</div>
          <p className="text-xs text-white/50 mt-1">Pick photos to share. Only the photos you select will be visible.</p>
          {myPhotos.length === 0 ? <div className="py-6 text-white/50 text-sm">No photos uploaded yet.</div> : (
            <div className="mt-4 max-h-[420px] overflow-y-auto grid grid-cols-4 md:grid-cols-6 gap-2">
              {myPhotos.map((p) => {
                const sel = selectedPhotos.has(p.id);
                return (
                  <button key={p.id} onClick={() => { const n = new Set(selectedPhotos); sel ? n.delete(p.id) : n.add(p.id); setSelectedPhotos(n); }} className={`relative aspect-square rounded-lg overflow-hidden border-2 ${sel ? 'border-pink-400' : 'border-transparent'}`}>
                    <img src={mediaSrc(p.id)} className="h-full w-full object-cover" alt=""/>
                    {sel && <Check className="absolute top-1 left-1 h-4 w-4 bg-pink-500 rounded-full p-0.5"/>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShareFor(null)} className="text-sm px-4 py-2 rounded-full bg-white/5 border border-white/10">Cancel</button>
            <button onClick={doSharePhotos} disabled={!selectedPhotos.size || busy === 'share'} className="text-sm px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 font-medium disabled:opacity-50">
              {busy === 'share' ? <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1"/> : <Send className="h-3.5 w-3.5 inline mr-1"/>} Share {selectedPhotos.size > 0 && `(${selectedPhotos.size})`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section>
      <div className="mb-3">
        <div className="text-xl font-semibold">{title}</div>
        {subtitle && <div className="text-sm text-white/50">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}
function Avatar({ u, lg }) {
  return <div className={`grid place-items-center rounded-full font-semibold flex-none ${lg ? 'h-11 w-11 text-base' : 'h-9 w-9 text-sm'}`} style={{ background: u?.avatarColor || '#a855f7' }}>{u?.name?.[0]?.toUpperCase() || '?'}</div>;
}
function Empty({ label }) { return <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-white/50">{label}</div>; }
function Modal({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur p-4 grid place-items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0b0414] p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white"><X className="h-5 w-5"/></button>
        {children}
      </div>
    </div>
  );
}
