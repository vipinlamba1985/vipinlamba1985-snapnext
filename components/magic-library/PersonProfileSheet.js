'use client';

import { useEffect, useMemo, useState } from 'react';
import { EyeOff, Merge, RotateCcw, Save, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { personThumbnailStyle } from '@/lib/people-intelligence';

export default function PersonProfileSheet({ person, people, onClose, onSaved, onViewMemories }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');

  useEffect(() => {
    if (!person) return;
    setForm({
      displayName: person.displayName === 'Add name' ? '' : person.displayName || '',
      relationship: person.relationship || '',
      birthday: person.birthday || '',
      phone: person.phone || '',
      email: person.email || '',
      notes: person.notes || '',
      representativeMediaId: person.representativeMediaId || '',
      thumbnailOverride: person.thumbnailOverride || { scale: 2, offsetX: 0, offsetY: 0 },
    });
    setMergeTarget('');
  }, [person]);

  const previewPerson = useMemo(() => person && form ? {
    ...person,
    representativeMediaId: form.representativeMediaId || person.representativeMediaId,
    thumbnailOverride: form.thumbnailOverride,
  } : person, [person, form]);

  if (!person || !form) return null;

  function patch(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function patchCrop(key, value) {
    setForm((current) => ({
      ...current,
      thumbnailOverride: { ...(current.thumbnailOverride || { scale: 2, offsetX: 0, offsetY: 0 }), [key]: Number(value) },
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = { clusterId: person.clusterId, ...form };
      if (!form.displayName.trim()) delete payload.displayName;
      await apiFetch('/magic-library/people', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success('Person profile saved');
      await onSaved?.();
      onClose();
    } catch (error) {
      toast.error(error.message || 'Could not save person profile');
    } finally {
      setSaving(false);
    }
  }

  async function hidePerson() {
    if (!window.confirm('Hide this person from People? Their photos will not be deleted.')) return;
    setSaving(true);
    try {
      await apiFetch('/magic-library/people', {
        method: 'PATCH',
        body: JSON.stringify({ clusterId: person.clusterId, action: 'hide' }),
      });
      toast.success('Person hidden');
      await onSaved?.();
      onClose();
    } catch (error) {
      toast.error(error.message || 'Could not hide person');
    } finally {
      setSaving(false);
    }
  }

  async function mergePerson() {
    if (!mergeTarget) return toast.error('Choose another person first.');
    if (!window.confirm('Merge these two people into one profile?')) return;
    setSaving(true);
    try {
      await apiFetch('/magic-library/people', {
        method: 'PATCH',
        body: JSON.stringify({ clusterId: person.clusterId, action: 'merge', targetClusterId: mergeTarget }),
      });
      toast.success('People merged');
      await onSaved?.();
      onClose();
    } catch (error) {
      toast.error(error.message || 'Could not merge people');
    } finally {
      setSaving(false);
    }
  }

  const style = personThumbnailStyle(previewPerson || {});
  const others = people.filter((item) => item.clusterId !== person.clusterId);
  const crop = form.thumbnailOverride || { scale: 2, offsetX: 0, offsetY: 0 };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-white/10 bg-[#111217] p-5 shadow-2xl md:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-pink-200/60">Person profile</p><h2 className="mt-1 text-2xl font-black text-white">Edit person</h2></div>
          <button onClick={onClose} className="rounded-full bg-white/5 p-2 text-white/60"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[220px_1fr]">
          <div>
            <div className="mx-auto h-48 w-48 overflow-hidden rounded-full border-4 border-white/15 bg-white/5 shadow-2xl">
              {previewPerson.representativeMediaId ? <img src={mediaSrc(previewPerson.representativeMediaId)} alt="" className="h-full w-full object-cover" style={style} /> : <div className="grid h-full w-full place-items-center"><UserRound className="h-12 w-12 text-white/30" /></div>}
            </div>

            <div className="mt-5 space-y-4">
              <Slider label="Zoom" min="1" max="8" step="0.05" value={crop.scale} onChange={(value) => patchCrop('scale', value)} />
              <Slider label="Move left / right" min="-100" max="100" step="1" value={crop.offsetX} onChange={(value) => patchCrop('offsetX', value)} />
              <Slider label="Move up / down" min="-100" max="100" step="1" value={crop.offsetY} onChange={(value) => patchCrop('offsetY', value)} />
              <button onClick={() => patch('thumbnailOverride', null)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/65"><RotateCcw className="h-3.5 w-3.5" /> Reset to automatic crop</button>
            </div>
          </div>

          <div className="space-y-4">
            <Field label="Name" value={form.displayName} onChange={(value) => patch('displayName', value)} placeholder="Add name" />
            <Field label="Relationship" value={form.relationship} onChange={(value) => patch('relationship', value)} placeholder="Friend, sister, colleague…" />
            <Field label="Birthday" value={form.birthday} onChange={(value) => patch('birthday', value)} placeholder="Optional" />
            <Field label="Phone" value={form.phone} onChange={(value) => patch('phone', value)} placeholder="Private to you" />
            <Field label="Email" value={form.email} onChange={(value) => patch('email', value)} placeholder="Private to you" type="email" />
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-white/50">Private notes</span><textarea value={form.notes} onChange={(event) => patch('notes', event.target.value)} rows={3} placeholder="Anything useful to remember" className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-pink-400/40" /></label>
          </div>
        </div>

        {!!person.candidateMediaIds?.length && <div className="mt-6"><h3 className="text-sm font-black text-white">Choose another photo</h3><p className="mt-1 text-xs text-white/40">Pick any memory from this person, then adjust the circle above.</p><div className="mt-3 flex gap-2 overflow-x-auto pb-2">{person.candidateMediaIds.map((id) => <button key={id} onClick={() => patch('representativeMediaId', id)} className={`h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 ${form.representativeMediaId === id ? 'border-pink-400' : 'border-white/10'}`}><img src={mediaSrc(id)} alt="" className="h-full w-full object-cover" /></button>)}</div></div>}

        <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
          <button onClick={() => onViewMemories?.(person.clusterId)} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-black">View {person.count} memories</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save profile'}</button>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
          <h3 className="text-sm font-black text-white">Fix duplicate people</h3>
          <div className="mt-3 flex gap-2"><select value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#181a20] px-3 py-2 text-sm text-white"><option value="">Choose another person</option>{others.map((item) => <option key={item.clusterId} value={item.clusterId}>{item.displayName === 'Add name' ? `Unnamed · ${item.count} memories` : item.displayName}</option>)}</select><button onClick={mergePerson} disabled={saving || !mergeTarget} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70 disabled:opacity-40"><Merge className="h-4 w-4" /> Merge</button></div>
        </div>

        <button onClick={hidePerson} disabled={saving} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-white/40 hover:text-rose-200"><EyeOff className="h-4 w-4" /> Hide this person from People</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-white/50">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-pink-400/40" /></label>;
}

function Slider({ label, value, onChange, ...props }) {
  return <label className="block"><span className="mb-1.5 flex items-center justify-between text-xs font-bold text-white/50"><span>{label}</span><span>{Number(value || 0).toFixed(1)}</span></span><input type="range" value={value ?? 0} onChange={(event) => onChange(event.target.value)} className="w-full accent-pink-500" {...props} /></label>;
}
