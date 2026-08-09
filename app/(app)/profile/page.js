'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Settings2, Shield, UserRound } from 'lucide-react';
import { apiFetch, getStoredUser, setStoredUser } from '@/lib/api-client';
import { entitlementForUser } from '@/lib/entitlements';

export default function ProfilePage() {
  const [user, setUser] = useState(() => getStoredUser());

  useEffect(() => {
    apiFetch('/auth/me').then(({ user: next }) => {
      setUser(next);
      setStoredUser(next);
    }).catch(() => {});
  }, []);

  const entitlement = entitlementForUser(user);

  return <div className="mx-auto max-w-4xl space-y-6 pb-32 md:pb-12">
    <header className="rounded-[2rem] border border-white/8 bg-gradient-to-br from-pink-500/12 via-purple-500/8 to-cyan-500/8 p-6">
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-xl font-black ring-2 ring-white/10" style={{ background: user?.avatarColor || '#a855f7' }}>{user?.name?.[0]?.toUpperCase() || 'U'}</div>
        <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">You / Profile</p><h1 className="mt-1 truncate text-3xl font-black">{user?.name || 'Your SnapNext'}</h1><p className="mt-1 truncate text-sm text-white/45">{user?.email || ''}</p><span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/60">{entitlement.badge}</span></div>
      </div>
      <p className="mt-5 max-w-2xl text-sm leading-6 text-white/50">Your identity and account overview live here. Settings, plan, storage and privacy stay in their own control surfaces under More.</p>
    </header>

    <section className="grid gap-3 sm:grid-cols-3">
      <ProfileLink href="/settings" icon={Settings2} title="Settings" copy="Notifications, email and account preferences" />
      <ProfileLink href="/plan-storage" icon={CreditCard} title="Plan & storage" copy="Plan, usage and backup controls" />
      <ProfileLink href="/privacy-security" icon={Shield} title="Privacy & security" copy="Face processing, deletion and account privacy" />
    </section>

    <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/5"><UserRound className="h-5 w-5 text-pink-200" /></div><div><h2 className="font-black">Profile is not a primary destination</h2><p className="mt-1 text-sm leading-6 text-white/45">SnapNext keeps the bottom navigation focused on Discover, Find, Add, Connect and Make. Profile remains available from More.</p></div></div>
    </section>
  </div>;
}

function ProfileLink({ href, icon: Icon, title, copy }) {
  return <Link href={href} className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 transition hover:bg-white/[0.055]"><Icon className="h-5 w-5 text-pink-200" /><h2 className="mt-4 font-black">{title}</h2><p className="mt-1 text-xs leading-5 text-white/45">{copy}</p></Link>;
}
