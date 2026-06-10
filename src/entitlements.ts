/**
 * Entitlements — which modules the current user has unlocked.
 * Currently local-only (no backend). DEV_UNLOCK_ALL opens everything in dev;
 * built modules have direct routes and bypass this check entirely.
 * Revisit if/when Warren gets accounts + paid modules.
 */

import type { ModuleId } from './guild'

export type Entitlements = Partial<Record<ModuleId, boolean>>

const DEV_UNLOCK_ALL = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false

export function hasAccess(entitlements: Entitlements, id: ModuleId, isFree: boolean): boolean {
  if (DEV_UNLOCK_ALL) return true
  if (isFree) return true
  return entitlements[id] === true
}

/** Stub — wire to a real backend if Warren ever gets accounts. */
export async function fetchEntitlements(_userId: string): Promise<Entitlements> {
  return {}
}
