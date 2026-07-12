import AppShell from '@/components/AppShell';
import AiEnrichmentRecovery from '@/components/AiEnrichmentRecovery';

export default function AppLayout({ children }) {
  return (
    <AppShell>
      <AiEnrichmentRecovery />
      {children}
    </AppShell>
  );
}
