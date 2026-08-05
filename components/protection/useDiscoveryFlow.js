'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildDiscoveryReport } from '@/lib/discovery-classify';
import { buildProtectionPlan } from '@/lib/protection-plan';
import { hashLocalFile } from '@/lib/file-hash';
import { requestProtectionDecisions } from '@/lib/protection-network';

const MAX_UPLOAD_PEOPLE = 4;

function personLabel(person = {}) {
  if (person.isSelf) return 'You';
  const value = String(person.displayName || '').trim();
  return !value || value === 'Add name' ? 'This person' : value;
}

export default function useDiscoveryFlow() {
  const [stage, setStage] = useState('welcome');
  const [items, setItems] = useState([]);
  const [usage, setUsage] = useState(null);
  const [queue, setQueue] = useState([]);
  const [hashProgress, setHashProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState(null);
  const [protecting, setProtecting] = useState(false);
  const [error, setError] = useState('');
  const [activePeople, setActivePeople] = useState([]);
  const [peopleBusy, setPeopleBusy] = useState(true);
  const [selectedPersonIds, setSelectedPersonIds] = useState([]);
  const [requestedPersonId, setRequestedPersonId] = useState('');

  useEffect(() => {
    let cancelled = false;
    const requested = typeof window === 'undefined'
      ? ''
      : String(new URLSearchParams(window.location.search).get('person') || '').trim();
    setRequestedPersonId(requested);

    Promise.all([
      apiFetch('/storage/usage'),
      apiFetch('/magic-library/people').catch(() => ({ people: [] })),
      apiFetch('/magic-library/activation').catch(() => ({ active: [], enabled: [] })),
    ]).then(([usageState, peopleState, activation]) => {
      if (cancelled) return;
      setUsage(usageState);
      const enabled = new Set(activation.enabled || activation.active || []);
      const people = (peopleState.people || [])
        .filter((person) => enabled.has(person.clusterId || person.name))
        .filter((person) => person.identityState !== 'unknown' && !['hidden', 'rejected', 'legacy'].includes(person.status))
        .map((person) => ({
          ...person,
          clusterId: person.clusterId || person.name,
          label: personLabel(person),
        }));
      setActivePeople(people);
      setPeopleBusy(false);
    }).catch(() => {
      if (cancelled) return;
      setPeopleBusy(false);
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!requestedPersonId || !activePeople.some((person) => person.clusterId === requestedPersonId)) return;
    setSelectedPersonIds((current) => current.length ? current : [requestedPersonId]);
  }, [requestedPersonId, activePeople]);

  const report = useMemo(() => buildDiscoveryReport(items), [items]);
  const unlimitedStorage = Boolean(usage?.plan?.id === 'super_user');
  const availableBytes = usage
    ? Math.max(0, (usage.plan?.storageBytes || 0) - (usage.usage?.bytes || 0))
    : null;
  const plan = useMemo(
    () => buildProtectionPlan(items, unlimitedStorage ? Number.MAX_SAFE_INTEGER : (availableBytes || 0), 'best_of_life'),
    [items, availableBytes, unlimitedStorage],
  );
  const selectedPeople = useMemo(
    () => activePeople.filter((person) => selectedPersonIds.includes(person.clusterId)),
    [activePeople, selectedPersonIds],
  );

  function updateQueue(localId, patch) {
    setQueue((current) => current.map((row) => row.localId === localId ? { ...row, ...patch } : row));
  }

  function togglePerson(clusterId) {
    if (selectedPersonIds.includes(clusterId)) {
      setSelectedPersonIds(selectedPersonIds.filter((value) => value !== clusterId));
      setError('');
      return;
    }
    if (selectedPersonIds.length >= MAX_UPLOAD_PEOPLE) {
      setError(`Choose up to ${MAX_UPLOAD_PEOPLE} people for one upload.`);
      return;
    }
    setSelectedPersonIds([...selectedPersonIds, clusterId]);
    setError('');
  }

  function reset() {
    setStage('welcome');
    setItems([]);
    setQueue([]);
    setSummary(null);
    setError('');
    setHashProgress({ done: 0, total: 0 });
    setSelectedPersonIds(activePeople.some((person) => person.clusterId === requestedPersonId) ? [requestedPersonId] : []);
  }

  async function prepareProtection() {
    setProtecting(true);
    setError('');
    setHashProgress({ done: 0, total: plan.selected.length });
    const prepared = [];
    for (let index = 0; index < plan.selected.length; index += 1) {
      const item = plan.selected[index];
      const hash = await hashLocalFile(item.file);
      prepared.push({
        localId: item.localId,
        name: item.name,
        size: item.size,
        mime: item.mime,
        hash,
        captureDate: item.captureDate,
        priorityType: 'best_of_life',
        priorityScore: item.priorityScore || 0,
        assignedPersonClusterIds: selectedPersonIds,
      });
      setHashProgress({ done: index + 1, total: plan.selected.length });
    }
    const decisions = await requestProtectionDecisions(prepared);
    const byId = new Map(decisions.map((decision) => [decision.localId, decision]));
    setQueue(plan.selected.map((item) => ({
      ...item,
      decision: byId.get(item.localId),
      status: decisionStatus(byId.get(item.localId)),
      progress: 0,
    })));
    setProtecting(false);
    return decisions;
  }

  return {
    stage,
    setStage,
    items,
    setItems,
    usage,
    report,
    availableBytes,
    unlimitedStorage,
    plan,
    queue,
    updateQueue,
    hashProgress,
    summary,
    setSummary,
    protecting,
    setProtecting,
    error,
    setError,
    activePeople,
    peopleBusy,
    selectedPersonIds,
    selectedPeople,
    togglePerson,
    reset,
    prepareProtection,
  };
}

function decisionStatus(decision) {
  if (!decision) return 'failed';
  if (decision.decision === 'ACCEPT') return 'waiting';
  if (decision.decision === 'SKIP_DUPLICATE') return 'duplicate';
  if (decision.decision === 'SKIP_NO_SPACE') return 'outside';
  return 'skipped';
}
