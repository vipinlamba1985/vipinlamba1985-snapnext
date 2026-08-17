import AppShell from '@/components/AppShell';
import AiEnrichmentRecovery from '@/components/AiEnrichmentRecovery';
import AskSnapNextLauncher from '@/components/AskSnapNextLauncher';
import FriendlyCopyGuard from '@/components/FriendlyCopyGuard';

export default function AppLayout({ children }) {
  return (
    <AppShell>
      <FriendlyCopyGuard />
      <AiEnrichmentRecovery />
      <AskSnapNextLauncher />
      {children}
    </AppShell>
  );
}
