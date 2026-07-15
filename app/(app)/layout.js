import AppShell from '@/components/AppShell';
import AiEnrichmentRecovery from '@/components/AiEnrichmentRecovery';
import FriendlyCopyGuard from '@/components/FriendlyCopyGuard';

export default function AppLayout({ children }) {
  return (
    <AppShell>
      <FriendlyCopyGuard />
      <AiEnrichmentRecovery />
      {children}
    </AppShell>
  );
}
