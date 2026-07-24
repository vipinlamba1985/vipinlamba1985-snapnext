'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { bestMagicItems, buildMagicSuggestions, filterMagicItems } from '@/lib/magic-library-view';

const ALL_MEMORY_COMMANDS = new Set([
  'all',
  'all memories',
  'show all',
  'show all memories',
  'everything',
  'my library',
]);

function isAllMemoriesCommand(value) {
  return ALL_MEMORY_COMMANDS.has(String(value || '').trim().toLowerCase());
}

export default function useMagicLibrary() {
  const [items, setItems] = useState([]);
  const [personItems, setPersonItems] = useState([]);
  const [personTotal, setPersonTotal] = useState(0);
  const [personBusy, setPersonBusy] = useState(false);
  const [people, setPeople] = useState([]);
  const [peopleEngineReady, setPeopleEngineReady] = useState(false);
  const [activation, setActivation] = useState({ planId: 'free', limit: 4, active: [], enabled: [] });
  const [favoriteNames, setFavoriteNames] = useState([]);
  const [draftNames, setDraftNames] = useState([]);
  const [query, setQueryState] = useState('');
  const [searchItems, setSearchItems] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [activePerson, setActivePersonState] = useState('');
  const [explicitAllMemories, setExplicitAllMemories] = useState(false);
  const [busy, setBusy] = useState(true);
  const [activating, setActivating] = useState(false);

  async function load() {
    setBusy(true);
    const [media, peopleState, state, favorites] = await Promise.all([
      apiFetch('/media').catch(() => ({ items: [] })),
      apiFetch('/magic-library/people').catch(() => ({ people: [], engineReady: false })),
      apiFetch('/magic-library/activation').catch(() => ({ planId: 'free', limit: 4, active: [], enabled: [] })),
      apiFetch('/favorites').catch(() => ({ accepted: [] })),
    ]);
    setItems(media.items || []);
    setPeople(peopleState.people || []);
    setPeopleEngineReady(Boolean(peopleState.engineReady));
    setActivation(state);
    setDraftNames(state.active || []);
    setFavoriteNames((favorites.accepted || []).map((row) => row.other?.name).filter(Boolean));
    setBusy(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let cancelled = false;
    if (!activePerson) {
      setPersonItems([]);
      setPersonTotal(0);
      setPersonBusy(false);
      return () => { cancelled = true; };
    }

    setPersonBusy(true);
    apiFetch(`/magic-library/people/${encodeURIComponent(activePerson)}/media?limit=2000`)
      .then((state) => {
        if (cancelled) return;
        setPersonItems(state.items || []);
        setPersonTotal(Number(state.total || 0));
      })
      .catch(() => {
        if (cancelled) return;
        setPersonItems([]);
        setPersonTotal(0);
      })
      .finally(() => { if (!cancelled) setPersonBusy(false); });

    return () => { cancelled = true; };
  }, [activePerson, items]);

  useEffect(() => {
    let cancelled = false;
    const normalized = String(query || '').trim();

    // Person pages already load the complete person set (up to the dedicated
    // 2,000-item safety cap), so their search remains instant and local.
    if (!normalized || activePerson) {
      setSearchItems([]);
      setSearchBusy(false);
      setSearchError('');
      return () => { cancelled = true; };
    }

    setSearchItems([]);
    setSearchBusy(true);
    setSearchError('');
    apiFetch(`/media?q=${encodeURIComponent(normalized)}`)
      .then((result) => {
        if (cancelled) return;
        setSearchItems(result.items || []);
      })
      .catch((error) => {
        if (cancelled) return;
        setSearchItems([]);
        setSearchError(error?.message || 'Search is unavailable right now.');
      })
      .finally(() => { if (!cancelled) setSearchBusy(false); });

    return () => { cancelled = true; };
  }, [query, activePerson]);

  const suggestions = useMemo(() => buildMagicSuggestions(items), [items]);
  const visibleItems = useMemo(() => {
    if (activePerson) return filterMagicItems(personItems, query, '');
    if (query) return searchItems;
    return items;
  }, [items, personItems, searchItems, query, activePerson]);
  const visibleTotal = useMemo(() => (activePerson && !query ? personTotal : visibleItems.length), [activePerson, personTotal, query, visibleItems.length]);
  const bestItems = useMemo(() => bestMagicItems(visibleItems), [visibleItems]);
  const videos = useMemo(() => visibleItems.filter((item) => item.kind === 'video'), [visibleItems]);
  const photos = useMemo(() => visibleItems.filter((item) => item.kind === 'photo'), [visibleItems]);

  function setActivePerson(value) {
    const next = String(value || '');
    if (next !== activePerson) {
      setPersonItems([]);
      setPersonTotal(0);
    }
    setActivePersonState(next);
    setExplicitAllMemories(!next);
  }

  function setQuery(value) {
    const next = String(value || '').trim();
    if (isAllMemoriesCommand(next)) {
      setQueryState('');
      setActivePersonState('');
      setSearchItems([]);
      setSearchError('');
      setExplicitAllMemories(true);
      return;
    }
    setQueryState(next);
    if (!next) {
      setSearchItems([]);
      setSearchError('');
    }
  }

  function toggleDraft(name) {
    if (activation.active.includes(name)) return;
    setDraftNames((current) => current.includes(name)
      ? current.filter((value) => value !== name)
      : current.length < activation.limit
        ? [...current, name]
        : current);
  }

  async function confirmActivation() {
    setActivating(true);
    try {
      const next = await apiFetch('/magic-library/activation', {
        method: 'POST',
        body: JSON.stringify({ people: draftNames }),
      });
      setActivation(next);
      setDraftNames(next.active || []);
      if (!activePerson && !explicitAllMemories && next.enabled?.length) setActivePersonState(next.enabled[0]);
      return next;
    } finally {
      setActivating(false);
    }
  }

  async function activatePerson(name) {
    if (!name || activation.active.includes(name)) return activation;
    if (activation.active.length >= activation.limit) {
      const error = new Error(`Your plan supports ${activation.limit} active people.`);
      error.code = 'active_people_limit';
      throw error;
    }

    setActivating(true);
    try {
      const requested = [...activation.active, name];
      const next = await apiFetch('/magic-library/activation', {
        method: 'POST',
        body: JSON.stringify({ people: requested }),
      });
      setActivation(next);
      setDraftNames(next.active || []);
      setPersonItems([]);
      setPersonTotal(0);
      setActivePersonState(name);
      setExplicitAllMemories(false);
      return next;
    } finally {
      setActivating(false);
    }
  }

  const activationForView = useMemo(() => {
    if (!explicitAllMemories) return activation;
    const enabled = activation.enabled || [];
    return {
      ...activation,
      enabled: {
        length: 0,
        includes: (name) => enabled.includes(name),
      },
    };
  }, [activation, explicitAllMemories]);

  return {
    items,
    people,
    peopleEngineReady,
    suggestions,
    activation: activationForView,
    favoriteNames,
    draftNames,
    query,
    activePerson,
    busy,
    personBusy,
    searchBusy,
    searchError,
    activating,
    visibleItems,
    visibleTotal,
    bestItems,
    videos,
    photos,
    setQuery,
    setActivePerson,
    toggleDraft,
    confirmActivation,
    activatePerson,
    reload: load,
  };
}
