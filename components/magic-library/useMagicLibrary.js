'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { bestMagicItems, buildMagicPeople, buildMagicSuggestions, filterMagicItems } from '@/lib/magic-library-view';

export default function useMagicLibrary() {
  const [items, setItems] = useState([]);
  const [activation, setActivation] = useState({ planId: 'free', limit: 4, active: [], enabled: [] });
  const [favoriteNames, setFavoriteNames] = useState([]);
  const [draftNames, setDraftNames] = useState([]);
  const [query, setQuery] = useState('');
  const [activePerson, setActivePerson] = useState('');
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

  function toggleDraft(name) {
    if (activation.active.includes(name)) return;
    setDraftNames((current) => current.includes(name) ? current.filter((value) => value !== name) : current.length < activation.limit ? [...current, name] : current);
  }

  async function confirmActivation() {
    setActivating(true);
    try {
      const next = await apiFetch('/magic-library/activation', { method: 'POST', body: JSON.stringify({ people: draftNames }) });
      setActivation(next);
      setDraftNames(next.active || []);
      if (!activePerson && next.enabled?.length) setActivePerson(next.enabled[0]);
      return next;
    } finally {
      setActivating(false);
    }
  }

  return { items, people, suggestions, activation, favoriteNames, draftNames, query, activePerson, busy, activating, visibleItems, bestItems, videos, photos, setQuery, setActivePerson, toggleDraft, confirmActivation, reload: load };
}
