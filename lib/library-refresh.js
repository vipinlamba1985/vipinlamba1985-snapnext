/**
 * Minimal in-page refresh signal.
 *
 * Replaces `window.location.reload()` in processing paths. A full reload
 * remounts every component, which resets the client-side "already retried"
 * guards and re-triggers automatic work — the reload itself was part of the
 * retry loop. Publishing a signal lets data owners re-fetch in place while
 * component state (and therefore the loop guards) survives.
 */

const listeners = new Set();

export function subscribeLibraryRefresh(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishLibraryRefresh(detail = {}) {
  for (const listener of [...listeners]) {
    try { listener(detail); } catch { /* a failing subscriber must not block the others */ }
  }
}

/** Test/teardown helper. */
export function clearLibraryRefreshListeners() {
  listeners.clear();
}
