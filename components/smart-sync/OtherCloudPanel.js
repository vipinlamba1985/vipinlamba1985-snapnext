'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ChevronDown,
  CloudCog,
  DatabaseZap,
  Loader2,
  Send,
  Server,
  Upload,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';

const PROVIDERS = [
  'Box',
  'pCloud',
  'MEGA',
  'Amazon Photos',
  'iCloud Photos',
  'Synology',
  'QNAP',
  'Nextcloud',
  'Other',
];

const ADVANCED = [
  {
    name: 'WebDAV',
    connectionType: 'webdav',
    description: 'For compatible personal clouds and hosted file servers.',
    icon: CloudCog,
  },
  {
    name: 'S3-compatible storage',
    connectionType: 's3_compatible',
    description: 'For private buckets and compatible object-storage services.',
    icon: DatabaseZap,
  },
  {
    name: 'Synology or NAS',
    connectionType: 'nas',
    description: 'For home servers and private network-attached storage.',
    icon: Server,
  },
];

export default function OtherCloudPanel({ disabled = false }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState('Box');
  const [customProvider, setCustomProvider] = useState('');
  const [connectionType, setConnectionType] = useState('cloud_service');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  function chooseAdvanced(item) {
    setOpen(true);
    setProvider('Other');
    setCustomProvider(item.name);
    setConnectionType(item.connectionType);
    setSubmitted(null);
    window.setTimeout(() => document.getElementById('other-cloud-request')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  async function submit(event) {
    event.preventDefault();
    const providerName = provider === 'Other' ? customProvider : provider;
    setBusy(true);
    try {
      const data = await apiFetch('/smart-sync/provider-requests', {
        method: 'POST',
        body: JSON.stringify({ providerName, connectionType, details }),
      });
      setSubmitted(data.request);
      toast.success(`${data.request.providerName} was added to your requested providers.`);
    } catch (error) {
      toast.error(error.message || 'Your provider request could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-4 rounded-3xl border border-dashed border-cyan-300/20 bg-cyan-500/[0.04]">
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpen(value => !value)}
      className="flex w-full items-center gap-4 p-4 text-left disabled:cursor-not-allowed disabled:opacity-40 sm:p-5"
      aria-expanded={open}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-200"><CloudCog className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-2"><strong className="font-black">Other cloud or storage</strong><span className="text-[11px] text-cyan-100/55">Import or request</span></span>
        <span className="mt-1 block text-xs leading-5 text-white/45">Bring files in now, request another provider, or register interest in compatible personal storage.</span>
      </span>
      <ChevronDown className={`h-5 w-5 shrink-0 text-white/35 transition ${open ? 'rotate-180' : ''}`} />
    </button>

    {open && <div className="border-t border-white/10 p-4 sm:p-5">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
          <Upload className="h-5 w-5 text-emerald-200" />
          <h3 className="mt-3 font-black">Import files now</h3>
          <p className="mt-1 text-xs leading-5 text-white/45">Choose photos and videos from your device or a cloud provider’s downloaded folder. This is immediate, but it is not continuous sync.</p>
          <Link href="/upload" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-black"><Upload className="h-3.5 w-3.5" /> Open upload</Link>
        </div>

        <form id="other-cloud-request" onSubmit={submit} className="rounded-2xl border border-white/10 bg-black/15 p-4">
          <Send className="h-5 w-5 text-purple-200" />
          <h3 className="mt-3 font-black">Request your provider</h3>
          <p className="mt-1 text-xs leading-5 text-white/45">SnapNext records demand without claiming the provider is already supported.</p>
          <label className="mt-4 block text-[11px] font-black uppercase tracking-[0.16em] text-white/35">Cloud or storage service</label>
          <select
            value={provider}
            onChange={event => {
              setProvider(event.target.value);
              setConnectionType('cloud_service');
              setSubmitted(null);
            }}
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#12091f] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/50"
          >
            {PROVIDERS.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          {provider === 'Other' && <input
            value={customProvider}
            onChange={event => { setCustomProvider(event.target.value); setSubmitted(null); }}
            maxLength={80}
            placeholder="Provider name"
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#12091f] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-300/50"
          />}
          <textarea
            value={details}
            onChange={event => setDetails(event.target.value)}
            maxLength={400}
            rows={3}
            placeholder="Optional: how you store photos there or what type of sync you need"
            className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-[#12091f] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-300/50"
          />
          <button type="submit" disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-full bg-cyan-300 px-4 py-2 text-xs font-black text-black disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Save request</button>
          {submitted && <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-100"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{submitted.providerName}</strong> is recorded. SnapNext will keep it marked as requested until a verified connector is released.</span></div>}
        </form>
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-black">Advanced compatible storage</h3><p className="mt-1 text-xs text-white/40">These are candidates, not active connections yet.</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-black text-white/35">Demand-based roadmap</span></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {ADVANCED.map(item => {
            const Icon = item.icon;
            return <button key={item.name} type="button" onClick={() => chooseAdvanced(item)} className="rounded-2xl border border-white/10 bg-black/10 p-4 text-left transition hover:border-cyan-300/25 hover:bg-cyan-500/[0.05]">
              <Icon className="h-5 w-5 text-cyan-200" />
              <p className="mt-3 text-sm font-black">{item.name}</p>
              <p className="mt-1 text-[11px] leading-5 text-white/40">{item.description}</p>
              <span className="mt-3 inline-block text-[11px] font-black text-cyan-200">Request support</span>
            </button>;
          })}
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-5 text-white/35">SnapNext will only show a real Connect button after read-only authentication, incremental discovery, duplicate checks, quota enforcement and verified-copy processing are complete for that source.</p>
    </div>}
  </div>;
}
