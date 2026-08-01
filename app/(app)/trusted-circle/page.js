'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  Check, ChevronRight, FolderPlus, Heart, ImageIcon, Loader2, LockKeyhole, Mail, MapPin,
  Send, ShieldCheck, Sparkles, Trash2, UserPlus, Users, X,
} from 'lucide-react';

const PERM_LABELS = {
  shareSharedPhotos: { label: 'Individual photos', detail: 'Allow photos you explicitly choose to share.' },
  shareAlbums: { label: 'Shared albums', detail: 'Allow access to albums you explicitly share.' },
  shareMemories: { label: 'Memory stories', detail: 'Allow memory stories you explicitly share.' },
  shareFuturePhotos: { label: 'Future-photo sharing', detail: 'Automatic future sharing stays off unless you turn it on.' },
  shareProfilePicture: { label: 'Profile picture', detail: 'Let this trusted person see your profile picture.' },
};

export default function TrustedCirclePage() {
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
  const [tripSuggestions, setTripSuggestions] = useState([]);

  async function load() {
    try {
      const [favorites, albumData, photoData, memoryData, ai, trips] = await Promise.all([
        apiFetch('/trusted-circle'),
        apiFetch('/shared/albums'),
        apiFetch('/shared/photos'),
        apiFetch('/shared/memories'),
        apiFetch('/trusted-circle/ai').catch(() => null),
        apiFetch('/trip-sharing').catch(() => null),
      ]);
      setData(favorites || { accepted: [], incoming: [], outgoing: [], blocked: [] });
      setAlbums(albumData || { owned: [], shared: [] });
      setSharedPhotos(photoData?.items || []);
      setMemories(memoryData?.memories || []);
      setAiInsights(ai || null);
      setTripSuggestions(trips?.suggestions || []);
    } catch (e) {
      toast.error(e.message || 'Trusted circle could not be opened.');
    }
  }

  async function approveTripShare(suggestion) {
    setBusy(`trip-${suggestion.id}`);
    try {
      const result = await apiFetch('/trip-sharing', {
        method: 'POST',
        body: JSON.stringify({ recipientUserId: suggestion.recipient.id, mediaIds: suggestion.mediaIds }),
      });
      toast.success(`Shared ${result.shared} photo${result.shared === 1 ? '' : 's'} with ${suggestion.recipient.name}.`);
      await load();
    } catch (e) {
      toast.error(e.message || 'Nothing was shared.');
    } finally {
      setBusy('');
    }
  }

  function dismissTripShare(suggestionId) {
    setTripSuggestions(current => current.filter(item => item.id !== suggestionId));
  }

  useEffect(() => { load(); }, []);

  async function invite(event) {
    event?.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy('invite');
    try {
      const response = await apiFetch('/trusted-circle/invite', { method: 'POST', body: JSON.stringify({ email: inviteEmail.trim() }) });
      if (response.alreadyTrusted) toast('You already trust this person.');
      else if (response.alreadyPending) toast('An invitation is already waiting.');
      else toast.success('Invitation sent.');
      setInviteEmail('');
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  }

  async function favAction(id, action) {
    setBusy(`${id}-${action}`);
    try {
      await apiFetch(`/trusted-circle/${id}/${action}`, { method: 'POST' });
      await load();
      const copy = { accept: 'Trusted person added.', decline: 'Invitation declined.', cancel: 'Invitation cancelled.', remove: 'Trusted person removed.' };
      toast.success(copy[action] || 'Updated.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  }

  async function openPerms(favorite) {
    setPermsFor(favorite);
    setPerms(null);
    try {
      const response = await apiFetch(`/trusted-circle/${favorite.id}/permissions`);
      setPerms(response.perms);
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function togglePerm(key) {
    const previous = perms;
    const next = { ...perms, [key]: !perms[key] };
    setPerms(next);
    try {
      await apiFetch(`/trusted-circle/${permsFor.id}/permissions`, { method: 'PUT', body: JSON.stringify({ [key]: next[key] }) });
    } catch (e) {
      setPerms(previous);
      toast.error(e.message);
    }
  }

  async function openShare(favorite) {
    setShareFor(favorite);
    setSelectedPhotos(new Set());
    if (!myPhotos.length) {
      try {
        const response = await apiFetch('/media?filter=photo');
        setMyPhotos(response.items?.slice(0, 48) || []);
      } catch (e) {
        toast.error(e.message);
      }
    }
  }

  async function doSharePhotos() {
    if (!selectedPhotos.size || !shareFor?.other?.id) return;
    setBusy('share');
    try {
      await apiFetch('/shared/photos', {
        method: 'POST',
        body: JSON.stringify({ mediaIds: [...selectedPhotos], recipientUserId: shareFor.other.id }),
      });
      toast.success(`Shared ${selectedPhotos.size} photo${selectedPhotos.size === 1 ? '' : 's'}.`);
      setShareFor(null);
      setSelectedPhotos(new Set());
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  }

  async function createAlbum(event) {
    event?.preventDefault();
    if (!newAlbumName.trim()) return;
    try {
      await apiFetch('/shared/albums', { method: 'POST', body: JSON.stringify({ name: newAlbumName.trim() }) });
      setNewAlbumName('');
      await load();
      toast.success('Album created.');
    } catch (e) {
      toast.error(e.message);
    }
  }

  const accepted = Array.isArray(data.accepted) ? data.accepted : [];
  const incoming = Array.isArray(data.incoming) ? data.incoming : [];
  const outgoing = Array.isArray(data.outgoing) ? data.outgoing : [];
  const sharedAlbums = [...(albums.owned || []).map(album => ({ ...album, mine: true })), ...(albums.shared || []).map(album => ({ ...album, mine: false }))];
  const relationshipObservation = aiInsights?.relationshipHighlights || null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-32 md:pb-12">
      <header data-testid="trusted-header">
        <div className="inline-flex items-center gap-2 rounded-full border border-pink-300/15 bg-pink-500/10 px-3 py-1.5 text-xs font-black text-pink-100"><Heart className="h-3.5 w-3.5 fill-pink-300" />Trusted circle</div>
        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">People you trust with your memories.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48 md:text-base">Connections are private and permission-based. Sharing stays under your control and can be changed or revoked.</p>
      </header>

      <section data-testid="trusted-privacy-explainer" className="rounded-[2rem] border border-purple-300/15 bg-gradient-to-br from-purple-500/[0.10] via-pink-500/[0.07] to-cyan-500/[0.05] p-5 md:p-6">
        <div className="flex gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/[0.06]"><LockKeyhole className="h-6 w-6 text-pink-100" /></div><div><h2 className="text-xl font-black">Sharing starts private</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Adding someone as trusted does not open your whole library. Photos, albums, memory stories, future sharing, and your profile picture each stay behind the permissions you control.</p></div></div>
      </section>

      <section data-testid="trusted-invite" className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-pink-500/12"><UserPlus className="h-5 w-5 text-pink-100" /></div><div><h2 className="font-black">Invite someone you love</h2><p className="mt-0.5 text-xs text-white/42">They can accept before any sharing begins.</p></div></div>
        <form onSubmit={invite} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input data-testid="trusted-invite-email" type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="Email address" className="min-h-12 flex-1 rounded-2xl border border-white/8 bg-black/20 px-4 text-sm outline-none placeholder:text-white/25 focus:border-pink-400/40" />
          <button data-testid="trusted-invite-submit" disabled={busy === 'invite' || !inviteEmail.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-6 text-sm font-black disabled:opacity-50">{busy === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Send invitation</button>
        </form>
        <p className="mt-2 text-xs text-white/35">Invitations currently connect existing SnapNext accounts.</p>
      </section>

      {incoming.length > 0 && <section data-testid="trusted-incoming"><SectionHeader title="Wants to connect" subtitle="Review each invitation before trusting them" /><div className="space-y-2">{incoming.map(favorite => <div key={favorite.id} className="flex flex-wrap items-center gap-3 rounded-3xl border border-cyan-300/15 bg-cyan-400/[0.05] p-4"><Avatar user={favorite.other} /><div className="min-w-0 flex-1"><h3 className="truncate font-black">{favorite.other?.name || 'SnapNext user'}</h3><p className="mt-1 truncate text-xs text-white/40">{favorite.other?.email}</p><span className="mt-2 inline-flex rounded-full bg-cyan-400/10 px-2.5 py-1 text-[10px] font-black text-cyan-100">Wants to connect</span></div><button data-testid={`trusted-decline-${favorite.id}`} onClick={() => favAction(favorite.id, 'decline')} disabled={busy === `${favorite.id}-decline`} className="min-h-10 rounded-full border border-white/8 bg-white/5 px-4 text-xs font-black text-white/60">Decline</button><button data-testid={`trusted-accept-${favorite.id}`} onClick={() => favAction(favorite.id, 'accept')} disabled={busy === `${favorite.id}-accept`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-black text-black"><Check className="h-3.5 w-3.5" />Trust</button></div>)}</div></section>}

      {outgoing.length > 0 && <section data-testid="trusted-outgoing"><SectionHeader title="Waiting for reply" subtitle="Invitations you have sent" /><div className="space-y-2">{outgoing.map(favorite => <div key={favorite.id} className="flex items-center gap-3 rounded-3xl border border-white/8 bg-white/[0.025] p-4"><Avatar user={favorite.other} /><div className="min-w-0 flex-1"><h3 className="truncate font-black">{favorite.other?.name || favorite.other?.email || 'Invitation'}</h3><p className="mt-1 truncate text-xs text-white/40">Invitation pending</p></div><span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] font-black text-amber-100">Waiting for reply</span><button data-testid={`trusted-cancel-${favorite.id}`} onClick={() => favAction(favorite.id, 'cancel')} disabled={busy === `${favorite.id}-cancel`} className="min-h-9 rounded-full border border-white/8 px-3 text-xs font-bold text-white/45">Cancel</button></div>)}</div></section>}

      <section data-testid="trusted-people-list">
        <SectionHeader title="Your trusted circle" subtitle={accepted.length ? `${accepted.length} connected` : 'People you approve will appear here'} />
        {accepted.length ? <div className="grid gap-3 md:grid-cols-2">{accepted.map(favorite => <div key={favorite.id} className="rounded-3xl border border-white/8 bg-white/[0.03] p-4"><div className="flex items-center gap-3"><Avatar user={favorite.other} large /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-black">{favorite.other?.name || 'Trusted person'}</h3><span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-100">Trusted</span></div><p className="mt-1 truncate text-xs text-white/40">{favorite.other?.email}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><button data-testid={`trusted-share-${favorite.id}`} onClick={() => openShare(favorite)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-xs font-black"><Send className="h-3.5 w-3.5" />Share photos</button><button data-testid={`trusted-permissions-${favorite.id}`} onClick={() => openPerms(favorite)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/8 bg-white/5 text-xs font-black text-white/65"><ShieldCheck className="h-3.5 w-3.5" />Permissions</button></div><button data-testid={`trusted-remove-${favorite.id}`} onClick={() => favAction(favorite.id, 'remove')} disabled={busy === `${favorite.id}-remove`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-rose-200/65"><Trash2 className="h-3.5 w-3.5" />Remove trusted access</button></div>)}</div> : <EmptyState icon={Users} title="Nobody in your circle yet" detail="Invite someone when you are ready. Nothing in your library changes until you choose to share." />}
      </section>

      {tripSuggestions.length > 0 && <section data-testid="trusted-trip-suggestions">
        <SectionHeader title="Trips you could share" subtitle="Suggestions only — nothing is shared until you approve it" />
        <div className="space-y-2">
          {tripSuggestions.map(suggestion => (
            <div key={suggestion.id} data-testid={`trusted-trip-${suggestion.id}`} className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-400/10"><MapPin className="h-4.5 w-4.5 text-cyan-100" /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black">{suggestion.tripTitle}</h3>
                  <p className="mt-1 text-sm text-white/45">
                    {suggestion.count} photo{suggestion.count === 1 ? '' : 's'} · for {suggestion.recipient.name}
                  </p>
                  <p className="mt-1 text-xs text-white/35">{suggestion.reason}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  data-testid={`trusted-trip-approve-${suggestion.id}`}
                  onClick={() => approveTripShare(suggestion)}
                  disabled={busy === `trip-${suggestion.id}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 text-xs font-black disabled:opacity-50"
                >
                  {busy === `trip-${suggestion.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Share these {suggestion.count}
                </button>
                <button data-testid={`trusted-trip-dismiss-${suggestion.id}`} onClick={() => dismissTripShare(suggestion.id)} className="min-h-10 rounded-full border border-white/8 bg-white/5 px-4 text-xs font-black text-white/55">Not now</button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-white/35">SnapNext prepares these from trips it can see in your own photos. It never shares automatically, and turning off photo sharing for someone stops their suggestions entirely.</p>
      </section>}

      {relationshipObservation && <section data-testid="trusted-observation" className="flex gap-4 rounded-3xl border border-white/8 bg-white/[0.025] p-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/15"><Sparkles className="h-4.5 w-4.5 text-pink-100" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">SnapNext noticed</p><p className="mt-1 text-sm leading-6 text-white/58">{relationshipObservation}</p></div></section>}

      <section data-testid="trusted-shared-with-you">
        <SectionHeader title="Shared with you" subtitle="Memories other trusted people chose to send" />
        {!sharedPhotos.length && !sharedAlbums.length && !memories.length ? <EmptyState icon={ImageIcon} title="Nothing shared yet" detail="When a trusted person shares a photo, album, or memory story with you, it will appear here." /> : <div className="space-y-5">
          {sharedPhotos.length > 0 && <div><MiniHeading title="Photos" /><div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-6">{sharedPhotos.slice(0, 18).map(item => <div key={item.id} className="relative aspect-square overflow-hidden rounded-xl bg-white/5"><img src={mediaSrc(item.media.id)} className="h-full w-full object-cover" alt="" /><div className="absolute inset-x-1 bottom-1 truncate rounded-lg bg-black/65 px-1.5 py-1 text-[9px] text-white/75">From {item.owner?.name || 'a trusted person'}</div></div>)}</div></div>}
          {sharedAlbums.length > 0 && <div><MiniHeading title="Albums" /><div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">{sharedAlbums.map(album => <Link data-testid={`trusted-album-${album.id}`} key={album.id} href={`/trusted-circle/album/${album.id}`} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-500/10"><ImageIcon className="h-4.5 w-4.5 text-purple-100" /></div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black">{album.name}</h3><p className="mt-1 text-xs text-white/38">{album.mine ? 'You created this album' : 'Shared with you'}</p></div><ChevronRight className="h-4 w-4 text-white/25" /></Link>)}</div></div>}
          {memories.length > 0 && <div><MiniHeading title="Memory stories" /><div className="space-y-2">{memories.map(memory => <div key={memory.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{memory.title}</h3><p className="mt-1 text-xs text-white/40">From {memory.owner?.name || 'a trusted person'}</p></div><button data-testid={`trusted-react-${memory.id}`} onClick={() => apiFetch(`/shared/memories/${memory.id}/react`, { method: 'POST', body: JSON.stringify({ emoji: '❤️' }) }).then(() => toast.success('Reaction sent ❤️')).catch(error => toast.error(error.message))} className="rounded-full bg-white/5 px-3 py-2 text-xs">❤️</button></div>{memory.mediaItems?.length > 0 && <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar">{memory.mediaItems.slice(0, 8).map(media => <img key={media.id} src={mediaSrc(media.id)} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />)}</div>}</div>)}</div></div>}
        </div>}
      </section>

      <section data-testid="trusted-album-create" className="rounded-3xl border border-white/8 bg-white/[0.025] p-5">
        <div className="flex items-center gap-3"><FolderPlus className="h-5 w-5 text-purple-100" /><div><h2 className="font-black">Start a shared album</h2><p className="mt-0.5 text-xs text-white/40">Create the album first, then choose who gets access.</p></div></div>
        <form onSubmit={createAlbum} className="mt-4 flex flex-col gap-2 sm:flex-row"><input data-testid="trusted-album-name" value={newAlbumName} onChange={event => setNewAlbumName(event.target.value)} placeholder="Album name" className="min-h-11 flex-1 rounded-2xl border border-white/8 bg-black/20 px-4 text-sm outline-none placeholder:text-white/25" /><button data-testid="trusted-album-create-button" disabled={!newAlbumName.trim()} className="min-h-11 rounded-full border border-white/8 bg-white/5 px-5 text-sm font-black disabled:opacity-40">Create album</button></form>
      </section>

      <section data-testid="trusted-privacy-reminder" className="rounded-3xl border border-emerald-300/10 bg-emerald-400/[0.04] p-5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /><div><h2 className="font-black">You can change your mind</h2><p className="mt-1 text-sm leading-6 text-white/48">Permissions can be turned off, trusted access can be removed, and new sharing requires your action. SnapNext should prepare and suggest—not silently widen access.</p></div></div></section>

      {permsFor && <Modal testId="trusted-permissions-modal" onClose={() => setPermsFor(null)}><div className="pr-10"><div className="flex items-center gap-2 text-lg font-black"><ShieldCheck className="h-5 w-5 text-emerald-200" />Permissions for {permsFor.other?.name}</div><p className="mt-1 text-xs leading-5 text-white/45">These settings control what your account is allowed to share with this person.</p></div>{!perms ? <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : <div className="mt-5 divide-y divide-white/5">{Object.entries(PERM_LABELS).map(([key, meta]) => <div key={key} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><h3 className="text-sm font-bold">{meta.label}</h3><p className="mt-1 text-xs leading-5 text-white/40">{meta.detail}</p></div><button data-testid={`trusted-permission-${key}`} onClick={() => togglePerm(key)} aria-pressed={!!perms[key]} className={`relative h-7 w-12 shrink-0 rounded-full ${perms[key] ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'bg-white/15'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${perms[key] ? 'left-6' : 'left-1'}`} /></button></div>)}</div>}</Modal>}

      {shareFor && <Modal testId="trusted-share-modal" onClose={() => setShareFor(null)}><div className="pr-10"><h2 className="text-lg font-black">Share photos with {shareFor.other?.name}</h2><p className="mt-1 text-xs leading-5 text-white/45">Only the photos you select in this step will be sent.</p></div>{myPhotos.length ? <div className="mt-4 grid max-h-[55vh] grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-5 md:grid-cols-6">{myPhotos.map(photo => { const selected = selectedPhotos.has(photo.id); return <button data-testid={`trusted-photo-${photo.id}`} key={photo.id} onClick={() => { const next = new Set(selectedPhotos); selected ? next.delete(photo.id) : next.add(photo.id); setSelectedPhotos(next); }} className={`relative aspect-square overflow-hidden rounded-xl border-2 ${selected ? 'border-pink-400' : 'border-transparent'}`}><img src={mediaSrc(photo.id)} className="h-full w-full object-cover" alt="" />{selected && <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-pink-500"><Check className="h-3.5 w-3.5" /></span>}</button>; })}</div> : <EmptyState icon={ImageIcon} title="No photos to share" detail="Back up photos first, then return here." />}
        <div className="mt-5 flex justify-end gap-2"><button onClick={() => setShareFor(null)} className="min-h-10 rounded-full border border-white/8 px-4 text-xs font-black text-white/55">Cancel</button><button data-testid="trusted-share-confirm" onClick={doSharePhotos} disabled={!selectedPhotos.size || busy === 'share'} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 px-5 text-xs font-black disabled:opacity-40">{busy === 'share' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Share {selectedPhotos.size || ''}</button></div></Modal>}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return <div className="mb-4"><h2 className="text-xl font-black md:text-2xl">{title}</h2>{subtitle && <p className="mt-1 text-sm text-white/42">{subtitle}</p>}</div>;
}

function MiniHeading({ title }) {
  return <h3 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-white/35">{title}</h3>;
}

function Avatar({ user, large = false }) {
  return <div className={`grid shrink-0 place-items-center rounded-full font-black ${large ? 'h-12 w-12 text-base' : 'h-10 w-10 text-sm'}`} style={{ background: user?.avatarColor || '#a855f7' }}>{user?.name?.[0]?.toUpperCase() || '?'}</div>;
}

function EmptyState({ icon: Icon, title, detail }) {
  return <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-7 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/5"><Icon className="h-5 w-5 text-white/30" /></div><h3 className="mt-3 font-black">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm leading-5 text-white/40">{detail}</p></div>;
}

function Modal({ testId, onClose, children }) {
  return <div data-testid={testId} className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/85 p-4 backdrop-blur-xl" onClick={onClose}><div onClick={event => event.stopPropagation()} className="relative w-full max-w-2xl rounded-[2rem] border border-white/10 bg-[#0b0414] p-5 md:p-6"><button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/5"><X className="h-4 w-4" /></button>{children}</div></div>;
}
