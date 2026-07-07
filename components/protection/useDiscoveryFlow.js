'use client';

import { useMemo, useState } from 'react';
import { buildDiscoveryReport } from '@/lib/discovery-classify';
import { buildProtectionPlan } from '@/lib/protection-plan';
import { hashLocalFile } from '@/lib/file-hash';
import { requestProtectionDecisions } from '@/lib/protection-network';

export default function useDiscoveryFlow() {
  const [stage, setStage] = useState('welcome');
  const [items, setItems] = useState([]);
  const [usage, setUsage] = useState(null);
  const [priority, setPriority] = useState({ type: 'best_of_life', personName: '', relationship: '' });
  const [queue, setQueue] = useState([]);
  const [hashProgress, setHashProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState(null);
  const [protecting, setProtecting] = useState(false);
  const report = useMemo(() => buildDiscoveryReport(items), [items]);
  const availableBytes = Math.max(0, (usage?.plan?.storageBytes || 0) - (usage?.usage?.bytes || 0));
  const plan = useMemo(() => buildProtectionPlan(items, availableBytes, priority.type), [items, availableBytes, priority.type]);

  function updateQueue(localId, patch) {
    setQueue((current) => current.map((row) => row.localId === localId ? { ...row, ...patch } : row));
  }

  async function prepareProtection() {
    setProtecting(true);
    setHashProgress({ done: 0, total: plan.selected.length });
    const prepared = [];
    for (let index = 0; index < plan.selected.length; index += 1) {
      const item = plan.selected[index];
      const hash = await hashLocalFile(item.file);
      prepared.push({ localId: item.localId, name: item.name, size: item.size, mime: item.mime, hash, captureDate: item.captureDate, priorityType: priority.type, priorityPersonName: priority.personName || null, relationship: priority.relationship || null, priorityScore: item.priorityScore || 0 });
      setHashProgress({ done: index + 1, total: plan.selected.length });
    }
    const decisions = await requestProtectionDecisions(prepared);
    const byId = new Map(decisions.map((decision) => [decision.localId, decision]));
    setQueue(plan.selected.map((item) => ({ ...item, decision: byId.get(item.localId), status: decisionStatus(byId.get(item.localId)), progress: 0 })));
    setProtecting(false);
    return decisions;
  }

  return { stage, setStage, items, setItems, usage, setUsage, priority, setPriority, report, availableBytes, plan, queue, setQueue, updateQueue, hashProgress, summary, setSummary, protecting, prepareProtection };
}

function decisionStatus(decision) {
  if (!decision) return 'failed';
  if (decision.decision === 'ACCEPT') return 'waiting';
  if (decision.decision === 'SKIP_DUPLICATE') return 'duplicate';
  if (decision.decision === 'SKIP_NO_SPACE') return 'outside';
  return 'skipped';
}
