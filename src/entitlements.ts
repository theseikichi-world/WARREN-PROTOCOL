/**
 * Entitlements — which modules the current user has unlocked.
 * Stored in Supabase: profiles.entitlements (jsonb)
 * Shape: { akki: true, bevi: false, hoot: true, ... }
 *
 * During development / before auth is wired up, DEV_UNLOCK_ALL
 * returns true for every module so you can work on any screen.
 */

import type { ModuleId } from './guild'

export type Entitlements = Partial<Record<ModuleId, boolean>>

const DEV_UNLOCK_ALL = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false

export function hasAccess(entitlements: Entitlements, id: ModuleId, isFree: boolean): boolean {
  if (DEV_UNLOCK_ALL) return true
  if (isFree) return true
  return entitlements[id] === true
}

/** Stub — replace with real Supabase fetch once auth is wired */
export async function fetchEntitlements(_userId: string): Promise<Entitlements> {
  // TODO: replace with supabase.from('profiles').select('entitlements').eq('id', userId)
  return {}
}
