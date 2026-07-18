"use client";

import { useSyncExternalStore } from "react";

// Tiny external store: a version counter bumped whenever session data changes
// (a session is saved or deleted). Data hooks subscribe to it so every page
// re-fetches from Postgres automatically — no localStorage, no manual wiring.

let version = 0;
const listeners = new Set<() => void>();

export function bumpSessions(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): number {
  return version;
}

/** Re-renders (and thus re-fetches, when used as a hook dependency) on any session change. */
export function useSessionsVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
