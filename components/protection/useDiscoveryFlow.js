'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDiscoveryReport } from '@/lib/discovery-classify';
import { buildProtectionPlan } from '@/lib/protection-plan';
import { hashLocalFile } from '@/lib/file-hash';
import {
  releaseProtectionReservations,
  requestProtectionDecisions,
} from '@/lib/protection-network';
import {
  ProtectionPreparationCancelledError,
  reservationIdsFromDecisions,
} from '@/lib/protection-decision-batches';
import { ProtectionPreparationRegistry } from '@/lib/protection-preparation';

export default function useDiscoveryFlow() {
  const [stage, setStage] = useState('welcome');
  const [items, setItemsState] = useState([]);
  const [usage, setUsage] = useState(null);
  const [priority, setPriority] = useState({ type: 'best_of_life', personName: '', relationship: '' });
  const [queue, setQueue] = useState([]);
  const [hashProgress, setHashProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState(null);
  const [protecting, setProtecting] = useState(false);
  const registryRef = useRef(null);
  const mountedRef = useRef(true);
  if (!registryRef.current) registryRef.current = new ProtectionPreparationRegistry();

  const report = useMemo(() => buildDiscoveryReport(items), [items]);
  const availableBytes = Math.max(0, (usage?.plan?.storageBytes || 0) - (usage?.usage?.bytes || 0));
  const plan = useMemo(() => buildProtectionPlan(items, availableBytes, priority.type), [items, availableBytes, priority.type]);

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
      // Invalidate any in-flight hashing/preflight before best-effort cleanup.
      // Queue-owned reservations are deliberately excluded by the registry.
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

  const replaceItems = useCallback(async (nextItems) => {
    const registry = registryRef.current;
    const generation = registry.advanceGeneration();
    await releaseAllPrepared('selection_replaced');
    if (!mountedRef.current || !registry.isCurrent(generation)) return false;
    setItemsState(Array.isArray(nextItems) ? nextItems : []);
    setQueue([]);
    setSummary(null);
    setHashProgress({ done: 0, total: 0 });
    return true;
  }, [releaseAllPrepared]);

  const resetFlow = useCallback(async () => {
    const registry = registryRef.current;
    const generation = registry.advanceGeneration();
    await releaseAllPrepared('restart');
    if (!mountedRef.current || !registry.isCurrent(generation)) return false;
    setItemsState([]);
    setQueue([]);
    setSummary(null);
    setHashProgress({ done: 0, total: 0 });
    setProtecting(false);
    setStage('welcome');
    return true;
  }, [releaseAllPrepared]);

  async function prepareProtection() {
    const registry = registryRef.current;
    const generation = registry.currentGeneration();
    const selected = plan.selected;
    setProtecting(true);
    setHashProgress({ done: 0, total: selected.length });
    const prepared = [];
    try {
      for (let index = 0; index < selected.length; index += 1) {
        if (!mountedRef.current || !registry.isCurrent(generation)) throw new ProtectionPreparationCancelledError();
        const item = selected[index];
        const hash = await hashLocalFile(item.file);
        if (!mountedRef.current || !registry.isCurrent(generation)) throw new ProtectionPreparationCancelledError();
        prepared.push({
          localId: item.localId,
          name: item.name,
          size: item.size,
          mime: item.mime,
          hash,
          captureDate: item.captureDate,
          priorityType: priority.type,
          priorityPersonName: priority.personName || null,
          relationship: priority.relationship || null,
          priorityScore: item.priorityScore || 0,
        });
        setHashProgress({ done: index + 1, total: selected.length });
      }

      const decisions = await requestProtectionDecisions(prepared, {
        isCurrent: () => mountedRef.current && registry.isCurrent(generation),
        onBatch: (batchDecisions) => registry.recordDecisions(generation, batchDecisions),
      });
      if (!mountedRef.current || !registry.isCurrent(generation)) throw new ProtectionPreparationCancelledError();

      const byId = new Map(decisions.map((decision) => [decision.localId, decision]));
      setQueue(selected.map((item) => ({
        ...item,
        decision: byId.get(item.localId),
        status: decisionStatus(byId.get(item.localId)),
        progress: 0,
      })));
      setProtecting(false);
      return decisions;
    } catch (error) {
      await releasePreparedGeneration(
        generation,
        error?.code === 'protection_preparation_cancelled' ? 'stale_preflight' : 'preflight_failed'
      ).catch(() => null);
      if (mountedRef.current && registry.isCurrent(generation)) setProtecting(false);
      throw error;
    }
  }

  function handoffPreparedReservations(decisions = []) {
    const registry = registryRef.current;
    const generation = registry.currentGeneration();
    const reservationIds = registry.handoff(generation, decisions);
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

  return {
    stage,
    setStage,
    items,
    setItems: replaceItems,
    replaceItems,
    resetFlow,
    usage,
    setUsage,
    priority,
    setPriority,
    report,
    availableBytes,
    plan,
    queue,
    setQueue,
    updateQueue,
    hashProgress,
    summary,
    setSummary,
    protecting,
    setProtecting,
    prepareProtection,
    handoffPreparedReservations,
    finalizeProtection,
    releasePreparedGeneration,
    releaseAllPrepared,
  };
}

function decisionStatus(decision) {
  if (!decision) return 'failed';
  if (decision.decision === 'ACCEPT') return 'waiting';
  if (decision.decision === 'SKIP_DUPLICATE') return 'duplicate';
  if (decision.decision === 'SKIP_NO_SPACE') return 'outside';
  return 'skipped';
}
