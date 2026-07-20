'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { AlertTriangle, CheckCircle2, Cloud, Images, Loader2, RefreshCw, Users } from 'lucide-react';

function Status({ ok, good = 'Verified', bad = 'Needs attention' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${ok ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-200'}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {ok ? good : bad}
    </span>
  );
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-white/40">{label}</div>
        {Icon && <Icon className="h-4 w-4 text-pink-200" />}
      </div>
      <div className="mt-2 text-3xl font-black text-white">{Number(value || 0).toLocaleString()}</div>
      {detail && <div className="mt-1 text-xs leading-5 text-white/45">{detail}</div>}
    </div>
  );
}

export default function StorageAuditPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await apiFetch('/admin/storage-consistency'));
    } catch (err) {
      setError(err?.message || 'Could not run the audit.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading && !data) {
    return <div className="grid min-h-[55vh] place-items-center text-white/60"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-pink-300" /><p className="mt-3 text-sm">Comparing MongoDB, AWS S3 and People counts…</p></div></div>;
  }

  if (error) {
    return <div className="rounded-3xl border border-rose-400/25 bg-rose-500/10 p-6"><h1 className="text-2xl font-black">Storage audit unavailable</h1><p className="mt-2 text-sm text-white/60">{error}</p><button onClick={load} className="mt-5 rounded-full bg-white px-5 py-2.5 text-sm font-black text-black">Try again</button></div>;
  }

  const verdict = data?.verdict || {};
  const gallery = data?.gallery || {};
  const aws = data?.aws || {};
  const people = data?.people || {};
  const mismatches = data?.mismatches || {};

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-pink-200/75">Private super-user report</p>
          <h1 className="mt-2 text-3xl font-black md:text-4xl">Storage & People Audit</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Exact live counts from MongoDB, the account’s AWS S3 prefix and People Intelligence. No photos or face data are exposed.</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-white disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Run again
        </button>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/15 to-transparent p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">AWS storage</h2><Status ok={verdict.storageHealthy} /></div>
          <p className="mt-2 text-sm leading-6 text-white/55">No missing, orphaned or size-mismatched objects means the database and bucket are synchronized.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/15 to-transparent p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">Live photos</h2><Status ok={verdict.everyLivePhotoSafeInAws} /></div>
          <p className="mt-2 text-sm leading-6 text-white/55">Every non-trashed gallery photo must have a matching AWS object with the same byte size.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/15 to-transparent p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">People counts</h2><Status ok={verdict.everyPersonCountMatches} /></div>
          <p className="mt-2 text-sm leading-6 text-white/55">Each person card count is compared with that person’s opened live-memory gallery.</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-black">Gallery database totals</h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <Metric label="Live memories" value={gallery.liveMemories} icon={Images} />
          <Metric label="Photos" value={gallery.photos} icon={Images} />
          <Metric label="Videos" value={gallery.videos} />
          <Metric label="Other" value={gallery.other} />
          <Metric label="Trash" value={gallery.trash} detail="Not shown in Gallery" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-black">AWS S3 totals</h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Metric label="Actual objects" value={aws.actualObjects} icon={Cloud} />
          <Metric label="Tracked live" value={aws.trackedLiveObjects} detail="Live database records using S3" />
          <Metric label="Tracked trash" value={aws.trackedTrashObjects} detail="Retained until permanent delete" />
          <Metric label="Verified photos" value={aws.verifiedLivePhotos} detail={`${Number(gallery.photos || 0).toLocaleString()} live gallery photos`} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Metric label="Missing in AWS" value={aws.missingInAwsCount} />
          <Metric label="Orphan AWS files" value={aws.orphanInAwsCount} />
          <Metric label="Size mismatches" value={aws.sizeMismatchCount} />
        </div>
        <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50/80">
          Raw Gallery and AWS object totals are not expected to be identical because Gallery excludes Trash, while AWS keeps trashed files until permanent deletion. The important check is <strong>live gallery photos = verified live AWS photos</strong>.
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-xl font-black">People memory counts</h2><p className="mt-1 text-sm text-white/45">{people.note}</p></div>
          <div className="flex gap-2"><Status ok={people.allIndividualCountsMatch} good="All card counts match" /><span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-black text-white/55">{Number(people.visiblePeople || 0).toLocaleString()} people</span></div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.025]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-[11px] uppercase tracking-[0.12em] text-white/40"><tr><th className="px-4 py-3">Person</th><th className="px-4 py-3">Card</th><th className="px-4 py-3">Gallery</th><th className="px-4 py-3">AWS safe</th><th className="px-4 py-3">Result</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {(people.rows || []).map((person) => (
                <tr key={person.clusterId}>
                  <td className="px-4 py-3 font-bold text-white">{person.name}</td>
                  <td className="px-4 py-3 text-white/65">{person.thumbnailCount}</td>
                  <td className="px-4 py-3 text-white/65">{person.galleryCount}</td>
                  <td className="px-4 py-3 text-white/65">{person.awsSafeCount}</td>
                  <td className="px-4 py-3"><Status ok={person.countMatchesGallery && person.allMemoriesSafeInAws} good="Matched" bad="Review" /></td>
                </tr>
              ))}
              {!(people.rows || []).length && <tr><td colSpan="5" className="px-4 py-8 text-center text-white/40"><Users className="mx-auto mb-2 h-5 w-5" />No visible People clusters yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Metric label="Unique memories with people" value={people.uniqueMemoriesWithPeople} />
          <Metric label="Total person memberships" value={people.totalPersonMemberships} detail="Can be higher because group photos count for each person" />
        </div>
      </section>

      {(aws.missingInAwsCount > 0 || aws.orphanInAwsCount > 0 || aws.sizeMismatchCount > 0) && (
        <section className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-5">
          <h2 className="text-lg font-black text-amber-100">Items needing attention</h2>
          <p className="mt-2 text-sm text-amber-50/70">Missing: {(mismatches.missingInAws || []).length} shown · Orphan: {(mismatches.orphanInAws || []).length} shown · Size mismatch: {(mismatches.sizeMismatches || []).length} shown{mismatches.truncated ? ' · results truncated to 100 per category' : ''}.</p>
        </section>
      )}

      <p className="text-xs text-white/30">Generated {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'now'} · {data?.privacy}</p>
    </div>
  );
}
