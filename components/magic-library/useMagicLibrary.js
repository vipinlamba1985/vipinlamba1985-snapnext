'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { bestMagicItems, buildMagicPeople, buildMagicSuggestions, filterMagicItems } from '@/lib/magic-library-view';

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
  const [activation, setActivation] = useState({ planId: 'free', limit: 4, active: [], enabled: [] });
  const [favoriteNames, setFavoriteNames] = useState([]);
  const [draftNames, setDraftNames] = useState([]);
  const [query, setQueryState] = useState('');
  const [activePerson, setActivePersonState] = useState('');
  const [explicitAllMemories, setExplicitAllMemories] = useState(false);
  const [busy, setBusy] = useState(true);
  const [activating, setActivating] = useState(false);

  async function load() {
    setBusy(true);
    const [media, state, favorites] = await Promise.all([
      apiFetch('/media').catch(() => ({ items: [] })),
      apiFetch('/magic-library/activation').catch(() => ({ planId: 'free', limit: 4, active: [], enabled: [] })),
      apiFetch('/favorites').catch(() => ({ accepted: [] })),
    ]);
    setItems(media.items || []);
    setActivation(state);
    setDraftNames(state.active || []);
    setFavoriteNames((favorites.accepted || []).map((row) => row.other?.name).filter(Boolean));
    setBusy(false);
  }

  useEffect(() => { load(); }, []);

  const people = useMemo(() => buildMagicPeople(items), [items]);
  const suggestions = useMemo(() => buildMagicSuggestions(items), [items]);
  const visibleItems = useMemo(() => filterMagicItems(items, query, activePerson), [items, query, activePerson]);
  const bestItems = useMemo(() => bestMagicItems(visibleItems), [visibleItems]);
  const videos = useMemo(() => visibleItems.filter((item) => item.kind === 'video'), [visibleItems]);
  const photos = useMemo(() => visibleItems.filter((item) => item.kind === 'photo'), [visibleItems]);

  function setActivePerson(value) {
    const next = String(value || '');
    setActivePersonState(next);
    setExplicitAllMemories(!next);
  }

  function setQuery(value) {
    const next = String(value || '').trim();
    if (isAllMemoriesCommand(next)) {
      setQueryState('');
      setActivePersonState('');
      setExplicitAllMemories(true);
      return;
    }
    setQueryState(next);
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
    suggestions,
    activation: activationForView,
    favoriteNames,
    draftNames,
    query,
    activePerson,
    busy,
    activating,
    visibleItems,
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
