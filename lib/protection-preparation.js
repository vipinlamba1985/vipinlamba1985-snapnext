import { normalizeReservationIds, reservationIdsFromDecisions } from './protection-decision-batches.js';

export class ProtectionPreparationRegistry {
  constructor() {
    this.generation = 1;
    this.prepared = new Map();
    this.queueOwned = new Set();
  }

  currentGeneration() {
    return this.generation;
  }

  advanceGeneration() {
    this.generation += 1;
    return this.generation;
  }

  isCurrent(generation) {
    return generation === this.generation;
  }

  recordDecisions(generation, decisions = []) {
    const ids = reservationIdsFromDecisions(decisions);
    if (!ids.length) return [];
    const current = this.prepared.get(generation) || new Set();
    for (const id of ids) {
      if (!this.queueOwned.has(id)) current.add(id);
    }
    if (current.size) this.prepared.set(generation, current);
    return ids;
  }

  preparedIds(generation) {
    return [...(this.prepared.get(generation) || [])];
  }

  allPreparedIds() {
    return normalizeReservationIds([...this.prepared.values()].flatMap((ids) => [...ids]));
  }

  markReleased(generation, ids = []) {
    const current = this.prepared.get(generation);
    if (!current) return;
    for (const id of normalizeReservationIds(ids)) current.delete(id);
    if (!current.size) this.prepared.delete(generation);
  }

  markReleasedEverywhere(ids = []) {
    const released = new Set(normalizeReservationIds(ids));
    if (!released.size) return;
    for (const [generation, current] of this.prepared.entries()) {
      for (const id of released) current.delete(id);
      if (!current.size) this.prepared.delete(generation);
    }
  }

  handoff(generation, decisions = []) {
    const requested = new Set(reservationIdsFromDecisions(decisions));
    const current = this.prepared.get(generation) || new Set();
    const handedOff = [];
    for (const id of current) {
      if (requested.size && !requested.has(id)) continue;
      this.queueOwned.add(id);
      handedOff.push(id);
      current.delete(id);
    }
    if (!current.size) this.prepared.delete(generation);
    else this.prepared.set(generation, current);
    return handedOff;
  }

  queueOwnedIds(ids = []) {
    const requested = normalizeReservationIds(ids);
    return requested.length
      ? requested.filter((id) => this.queueOwned.has(id))
      : [...this.queueOwned];
  }

  finishQueue(ids = []) {
    for (const id of normalizeReservationIds(ids)) this.queueOwned.delete(id);
  }

  returnQueueToCleanup(generation, ids = []) {
    const current = this.prepared.get(generation) || new Set();
    for (const id of normalizeReservationIds(ids)) {
      this.queueOwned.delete(id);
      current.add(id);
    }
    if (current.size) this.prepared.set(generation, current);
  }
}
