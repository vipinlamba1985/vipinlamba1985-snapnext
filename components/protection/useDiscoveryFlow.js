'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildDiscoveryReport } from '@/lib/discovery-classify';
import { buildProtectionPlan } from '@/lib/protection-plan';
import { hashLocalFile } from '@/lib/file-hash';
import { requestProtectionDecisions } from '@/lib/protection-network';
import { uploadProtectedDirect } from '@/lib/protection-direct-client';
import { uploadProtectedViaServer } from '@/lib/protection-server-client';

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

  return { stage, setStage, items, setItems, usage, setUsage, priority, setPriority, report, availableBytes, plan, queue, setQueue, updateQueue, hashProgress, setHashProgress, summary, setSummary, protecting, setProtecting };
}
