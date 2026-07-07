'use client';

import { useMemo, useState } from 'react';
import { buildDiscoveryReport } from '@/lib/discovery-classify';
import { buildProtectionPlan } from '@/lib/protection-plan';

export default function useDiscoveryFlow() {
  const [stage, setStage] = useState('welcome');
  const [items, setItems] = useState([]);
  const [usage, setUsage] = useState(null);
  const [priority, setPriority] = useState({ type: 'best_of_life', personName: '', relationship: '' });
  const report = useMemo(() => buildDiscoveryReport(items), [items]);
  const availableBytes = Math.max(0, (usage?.plan?.storageBytes || 0) - (usage?.usage?.bytes || 0));
  const plan = useMemo(() => buildProtectionPlan(items, availableBytes, priority.type), [items, availableBytes, priority.type]);
  return { stage, setStage, items, setItems, usage, setUsage, priority, setPriority, report, availableBytes, plan };
}
