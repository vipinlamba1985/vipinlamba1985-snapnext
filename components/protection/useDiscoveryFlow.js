'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildDiscoveryReport } from '@/lib/discovery-classify';
import { hashLocalFile } from '@/lib/file-hash';
import {
  releaseProtectionReservations,
  requestProtectionDecisions,
} from '@/lib/protection-network';
import { ProtectionPreparationCancelledError } from '@/lib/protection-decision-batches';
import { ProtectionPreparationRegistry } from '@/lib/protection-preparation';

const MAX_UPLOAD_PEOPLE = 4;

function personLabel(person = {}) {
  if (person.isSelf) return 'You';
  const value = String(person.displayName || '').trim();
  return !value || value === 'Add name' ? 'This person' : value;
}

function decisionStatus(decision) {
  if (!decision) return 'failed';
  if (decision.decision === 'ACCEPT') return 'waiting';
  if (decision.decision === 'SKIP_DUPLICATE') return 'duplicate';
  if (decision.decision === 'SKIP_NO_SPACE') return 'outside';
  return 'skipped';
}

function decisionReason(decision) {
  if (!decision) return 'SnapNext could not check this file.';
  if (decision.decision === 'SKIP_DUPLICATE') return 'Already backed up.';
  if (decision.decision === 'SKIP_NO_SPACE') return 'Not enough storage is available.';
  if (decision.decision === 'SKIP_UNSUPPORTED') return 'This file type is not supported.';
  if (decision.decision === 'SKIP_TOO_LARGE') return 'This file is too large for the available upload method.';
  if (decision.decision === 'SKIP_DIRECT_REQUIRED') return 'Direct storage is temporarily unavailable for this large file.';
  return '';
}

function uniqueMediaIds(queue = []) {
  return [...new Set(queue.flatMap((row) => {
    if (row.status === 'completed' && row.mediaId) return [row.mediaId];
    if (row.status === 'duplicate' && row.decision?.existingMediaId) return [row.decision.existingMediaId];
    return [];
  }))];
}

export default function useDiscoveryFlow() {
  const [stage, setStage] = useState('welcome');
  const [items, setItemsState] = useState([]);
  const [usage, setUsage] = useState(null);
  const [queue, setQueue] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [hashProgress, setHashProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState(null);
  const [protecting, setProtecting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [activePeople, setActivePeople] = useState([]);
  const [peopleBusy, setPeopleBusy] = useState(true);
  const [requestedPersonId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return String(new URLSearchParams(window.location.search).get('person') || '').trim();
  });
  const [uploadPersonIds, setUploadPersonIds] = useState([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState([]);
  const [organizing, setOrganizing] = useState(false);
  const [organizationDone, setOrganizationDone] = useState(false);
  const [organizationError, setOrganizationError] = useState('');
  const registryRef = useRef(null);
  const mountedRef = useRef(true);
  if (registryRef.current == null) registryRef.current = new ProtectionPreparationRegistry();

  useEffect(() => {
    let cancelled = false;
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
      if (requestedPersonId) {
        const target = people.find((person) => person.clusterId === requestedPersonId);
        if (target) {
          setUploadPersonIds([target.clusterId]);
          setSelectedPersonIds([target.clusterId]);
        } else {
          setError('This person is not available for direct upload. Your memories can still be backed up normally.');
        }
      }
      setPeopleBusy(false);
    }).catch(() => {
      if (cancelled) return;
      setPeopleBusy(false);
    });
    return () => { cancelled = true; };
  }, [requestedPersonId]);

  const report = useMemo(() => buildDiscoveryReport(items), [items]);
  const unlimitedStorage = Boolean(usage?.plan?.id === 'super_user');
  const availableBytes = usage
    ? Math.max(0, (usage.plan?.storageBytes || 0) - (usage.usage?.bytes || 0))
    : null;

  const decisionsById = useMemo(
    () => new Map(decisions.map((decision) => [decision.localId, decision])),
    [decisions],
  );

  const plan = useMemo(() => {
    const selected = items.filter((item) => decisionsById.get(item.localId)?.decision === 'ACCEPT');
    const outside = items.filter((item) => {
      const decision = decisionsById.get(item.localId)?.decision;
      return decision && decision !== 'ACCEPT' && decision !== 'SKIP_DUPLICATE';
    });
    return {
      selected,
      outside,
      usedBytes: selected.reduce((sum, item) => sum + Number(item.size || 0), 0),
    };
  }, [items, decisionsById]);

  const decisionSummary = useMemo(() => {
    const summaryState = {
      selected: items.length,
      ready: 0,
      duplicates: 0,
      noSpace: 0,
      unsupported: 0,
      tooLarge: 0,
      directRequired: 0,
      approvedBytes: 0,
    };
    for (const item of items) {
      const decision = decisionsById.get(item.localId);
      if (decision?.decision === 'ACCEPT') {
        summaryState.ready += 1;
        summaryState.approvedBytes += Number(item.size || 0);
      } else if (decision?.decision === 'SKIP_DUPLICATE') summaryState.duplicates += 1;
      else if (decision?.decision === 'SKIP_NO_SPACE') summaryState.noSpace += 1;
      else if (decision?.decision === 'SKIP_UNSUPPORTED') summaryState.unsupported += 1;
      else if (decision?.decision === 'SKIP_TOO_LARGE') summaryState.tooLarge += 1;
      else if (decision?.decision === 'SKIP_DIRECT_REQUIRED') summaryState.directRequired += 1;
    }
    return summaryState;
  }, [items, decisionsById]);

  const selectedPeople = useMemo(
    () => activePeople.filter((person) => selectedPersonIds.includes(person.clusterId)),
    [activePeople, selectedPersonIds],
  );
  const uploadPeople = useMemo(
    () => activePeople.filter((person) => uploadPersonIds.includes(person.clusterId)),
    [activePeople, uploadPersonIds],
  );
  const organizableMediaIds = useMemo(() => uniqueMediaIds(queue), [queue]);

  function updateQueue(localId, patch) {
    setQueue((current) => current.map((row) => row.localId === localId ? { ...row, ...patch } : row));
  }

  const releasePreparedGeneration = useCallback(async (generation, reason = 'cancelled', options = {}) => {
    const registry = registryRef.current;
    const ids = registry.preparedIds(generation);
    if (!ids.length) return { requested: 0, released: 0, ignored: 0, succeededIds: [], failedIds: [] };
    const result = await releaseProtectionReservations(ids, { reason, keepalive: Boolean(options.keepalive) });
    registry.markReleased(generation, result.succeededIds);
    return result;
  }, []);

  const releaseAllPrepared = useCallback(async (reason = 'cancelled', options = {}) => {
    const registry = registryRef.current;
    const ids = registry.allPreparedIds();
    if (!ids.length) return { requested: 0, released: 0, ignored: 0, succeededIds: [], failedIds: [] };
    const result = await releaseProtectionReservations(ids, { reason, keepalive: Boolean(options.keepalive) });
    registry.markReleasedEverywhere(result.succeededIds);
    return result;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const leave = () => {
      registryRef.current.advanceGeneration();
      void releaseAllPrepared('page_exit', { keepalive: true });
    };
    window.addEventListener('pagehide', leave);
    return () => {
      mountedRef.current = false;
      registryRef.current.advanceGeneration();
      window.removeEventListener('pagehide', leave);
      void releaseAllPrepared('page_exit', { keepalive: true });
    };
  }, [releaseAllPrepared]);

  const checkItems = useCallback(async (nextItems) => {
    const normalizedItems = Array.isArray(nextItems) ? nextItems : [];
    if (!normalizedItems.length) return false;
    const registry = registryRef.current;
    const generation = registry.advanceGeneration();

    setChecking(true);
    setError('');
    setStage('checking');
    setQueue([]);
    setDecisions([]);
    setSummary(null);
    setOrganizationDone(false);
    setOrganizationError('');
    setHashProgress({ done: 0, total: normalizedItems.length });

    await releaseAllPrepared('selection_replaced').catch(() => null);
    if (!mountedRef.current || !registry.isCurrent(generation)) return false;
    setItemsState(normalizedItems);

    const prepared = [];
    try {
      for (let index = 0; index < normalizedItems.length; index += 1) {
        if (!mountedRef.current || !registry.isCurrent(generation)) throw new ProtectionPreparationCancelledError();
        const item = normalizedItems[index];
        const hash = await hashLocalFile(item.file);
        if (!mountedRef.current || !registry.isCurrent(generation)) throw new ProtectionPreparationCancelledError();
        prepared.push({
          localId: item.localId,
          name: item.name,
          size: item.size,
          mime: item.mime,
          hash,
          captureDate: item.captureDate,
          priorityType: 'best_of_life',
          priorityScore: item.priorityScore || 0,
          assignedPersonClusterIds: uploadPersonIds,
        });
        setHashProgress({ done: index + 1, total: normalizedItems.length });
      }

      const checkedDecisions = await requestProtectionDecisions(prepared, {
        isCurrent: () => mountedRef.current && registry.isCurrent(generation),
        onBatch: (batchDecisions) => registry.recordDecisions(generation, batchDecisions),
      });
      if (!mountedRef.current || !registry.isCurrent(generation)) throw new ProtectionPreparationCancelledError();

      const byId = new Map(checkedDecisions.map((decision) => [decision.localId, decision]));
      setDecisions(checkedDecisions);
      setQueue(normalizedItems.map((item) => {
        const decision = byId.get(item.localId);
        return {
          ...item,
          decision,
          status: decisionStatus(decision),
          progress: 0,
          error: decisionReason(decision),
          mediaId: decision?.existingMediaId || null,
        };
      }));
      setChecking(false);
      setStage('review');
      return true;
    } catch (caught) {
      await releasePreparedGeneration(
        generation,
        caught?.code === 'protection_preparation_cancelled' ? 'stale_preflight' : 'preflight_failed',
      ).catch(() => null);
      if (mountedRef.current && registry.isCurrent(generation)) {
        setChecking(false);
        setError(caught?.code === 'protection_preparation_cancelled'
          ? ''
          : caught?.message || 'SnapNext could not check these files. Please try again.');
        setStage('welcome');
      }
      return false;
    }
  }, [releaseAllPrepared, releasePreparedGeneration, uploadPersonIds]);

  const resetFlow = useCallback(async () => {
    const registry = registryRef.current;
    const generation = registry.advanceGeneration();
    setChecking(true);
    await releaseAllPrepared('restart').catch(() => null);
    if (!mountedRef.current || !registry.isCurrent(generation)) return false;
    setItemsState([]);
    setQueue([]);
    setDecisions([]);
    setSummary(null);
    setError('');
    setHashProgress({ done: 0, total: 0 });
    setProtecting(false);
    setChecking(false);
    setOrganizationDone(false);
    setOrganizationError('');
    setSelectedPersonIds(uploadPersonIds);
    setStage('welcome');
    return true;
  }, [releaseAllPrepared, uploadPersonIds]);

  function handoffPreparedReservations(currentDecisions = decisions) {
    const registry = registryRef.current;
    const generation = registry.currentGeneration();
    const reservationIds = registry.handoff(generation, currentDecisions);
    return { generation, reservationIds };
  }

  async function finalizeProtection(handoff) {
    const registry = registryRef.current;
    const generation = handoff?.generation;
    const ids = registry.queueOwnedIds(handoff?.reservationIds || []);
    if (!ids.length) return { requested: 0, released: 0, ignored: 0, failedIds: [] };
    const result = await releaseProtectionReservations(ids, { reason: 'queue_cleanup' });
    registry.finishQueue(result.succeededIds);
    if (result.failedIds.length) registry.returnQueueToCleanup(generation, result.failedIds);
    return result;
  }

  async function confirmDuplicateAssignments(currentDecisions = decisions) {
    if (!uploadPersonIds.length) return { applied: 0, failed: 0 };
    const duplicateMediaIds = [...new Set(currentDecisions
      .filter((decision) => decision?.decision === 'SKIP_DUPLICATE' && decision.existingMediaId)
      .map((decision) => decision.existingMediaId))];
    const settled = await Promise.allSettled(duplicateMediaIds.map((mediaId) => apiFetch(`/media/${encodeURIComponent(mediaId)}/organize`, {
      method: 'PATCH',
      body: JSON.stringify({ addConfirmedPersonClusterIds: uploadPersonIds }),
    })));
    return {
      applied: settled.filter((result) => result.status === 'fulfilled').length,
      failed: settled.filter((result) => result.status === 'rejected').length,
    };
  }

  function togglePerson(clusterId) {
    setOrganizationDone(false);
    setOrganizationError('');
    setSelectedPersonIds((current) => {
      if (current.includes(clusterId)) return current.filter((value) => value !== clusterId);
      if (current.length >= MAX_UPLOAD_PEOPLE) {
        setOrganizationError(`Choose up to ${MAX_UPLOAD_PEOPLE} people.`);
        return current;
      }
      return [...current, clusterId];
    });
  }

  async function organizeFinishedMemories() {
    if (!selectedPersonIds.length || !organizableMediaIds.length) return false;
    setOrganizing(true);
    setOrganizationError('');
    const settled = await Promise.allSettled(organizableMediaIds.map((mediaId) => apiFetch(`/media/${encodeURIComponent(mediaId)}/organize`, {
      method: 'PATCH',
      body: JSON.stringify({ addConfirmedPersonClusterIds: selectedPersonIds }),
    })));
    const failed = settled.filter((result) => result.status === 'rejected').length;
    setOrganizing(false);
    setOrganizationDone(failed === 0);
    if (failed) setOrganizationError(`${failed} ${failed === 1 ? 'memory could' : 'memories could'} not be organized. Try again.`);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('snapnext:library-refresh'));
    return failed === 0;
  }

  return {
    stage,
    setStage,
    items,
    usage,
    report,
    availableBytes,
    unlimitedStorage,
    plan,
    queue,
    decisions,
    decisionSummary,
    updateQueue,
    hashProgress,
    summary,
    setSummary,
    protecting,
    setProtecting,
    checking,
    error,
    setError,
    activePeople,
    peopleBusy,
    requestedPersonId,
    uploadPeople,
    selectedPersonIds,
    selectedPeople,
    togglePerson,
    organizing,
    organizationDone,
    organizationError,
    organizableMediaIds,
    checkItems,
    reset: resetFlow,
    resetFlow,
    handoffPreparedReservations,
    finalizeProtection,
    confirmDuplicateAssignments,
    organizeFinishedMemories,
    releasePreparedGeneration,
    releaseAllPrepared,
  };
}
