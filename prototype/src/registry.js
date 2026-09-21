/**
 * Registry loader + capability queries.
 *
 * The registry is the single source of truth for what a provider can do.
 * Nothing else in the system hardcodes provider behaviour.
 *
 * Reads ../../docs/registry/providers.example.json
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = path.resolve(__dirname, '../../docs/registry/providers.example.json')

let _cache = null

export async function loadRegistry() {
  if (_cache) return _cache
  _cache = JSON.parse(await readFile(REGISTRY_PATH, 'utf8'))
  return _cache
}

export function providerById(registry, id) {
  return registry.providers.find((p) => p.id === id) ?? null
}

/** Providers a tenant may actually pick. Disabled/blocked providers are never shown. */
export function selectableProviders(registry) {
  return registry.providers.filter((p) => p.enabled && !p.blockedReason && p.id !== 'house')
}

/** Loose sentinel check — we never present unverified values as facts. */
export const isUnverified = (v) =>
  v === 'VERIFY' || (typeof v === 'string' && v.includes('VERIFY')) || v === null || v === undefined

/**
 * Can this provider fill this slot?
 * Capability-aware, not a switch statement — the whole point of the adapter layer.
 */
export function validateAssignment(provider, slot) {
  if (!provider) return { ok: false, reason: 'unknown provider' }
  if (!provider.enabled) return { ok: false, reason: 'provider not enabled' }
  if (provider.blockedReason) return { ok: false, reason: provider.blockedReason }

  // slotModel determines the render path — a link_rewrite provider cannot fill a display box
  if (provider.slotModel === 'link_rewrite') {
    return { ok: false, reason: 'link_rewrite providers rewrite content links; they do not fill display slots' }
  }
  if (provider.slotModel === 'per_site_auto') {
    return { ok: false, reason: 'per_site_auto providers take over placement; incompatible with platform-defined slots' }
  }
  if (!['per_slot', 'per_zone'].includes(provider.slotModel)) {
    return { ok: false, reason: `unsupported slotModel: ${provider.slotModel}` }
  }

  const overlap = slot.formats.filter((f) => provider.formats.includes(f))
  if (overlap.length === 0) {
    return { ok: false, reason: `no format overlap (slot: ${slot.formats.join('/')}, provider: ${provider.formats.join('/')})` }
  }

  return { ok: true, matchedFormats: overlap }
}

/**
 * The Nepal payout filter — three axes, not one.
 * Returns a health verdict we can surface in the provider picker.
 */
export function payoutVerdict(provider) {
  const declared = (provider.payoutMethods ?? []).filter((m) => !isUnverified(m))
  if (declared.length === 0) {
    return { level: 'unknown', threshold: provider.minPayoutUsd ?? null, usableMethods: [],
             message: 'Payout methods not yet verified — cannot promise a Nepali user will get paid.' }
  }
  const methods = declared.map((m) => m.toLowerCase())
  const usable = methods.filter((m) => !m.includes('crypto') && !m.includes('paypal'))
  const nepalNotes = []

  if (usable.length === 0) {
    nepalNotes.push('Only PayPal and/or crypto rails listed — historically unusable from Nepal.')
  }
  if (methods.some((m) => m.includes('crypto'))) {
    nepalNotes.push('Lists crypto payouts — Nepal prohibits cryptocurrency transactions.')
  }
  if (methods.some((m) => m.includes('paypal'))) {
    nepalNotes.push('Lists PayPal — receiving funds in Nepal has historically not been supported.')
  }

  const threshold = typeof provider.minPayoutUsd === 'number' ? provider.minPayoutUsd : null
  if (threshold !== null && threshold >= 100) {
    nepalNotes.push(`$${threshold} minimum — for small Nepali creators this can mean a multi-year wait.`)
  }

  return {
    level: nepalNotes.length === 0 ? 'ok' : usable.length === 0 ? 'blocked' : 'caution',
    threshold,
    usableMethods: usable,
    message: nepalNotes.length ? nepalNotes.join(' ') : `Usable from Nepal: ${usable.join(', ')}`,
  }
}

/**
 * DEMO ONLY. Flip specific providers to enabled so the resolution engine's
 * behaviour is observable before verification is finished.
 *
 * Never do this in production. A provider stays disabled until every box in
 * docs/provider-verification-checklist.md is ticked.
 */
export function enableForDemo(registry, ids) {
  const enabled = [];
  const providers = registry.providers.map((p) => {
    if (!ids.includes(p.id)) return p
    if (p.blockedReason) return p // blocked providers stay blocked even in demo
    enabled.push(p.id)
    return { ...p, enabled: true }
  })
  return { registry: { ...registry, providers }, enabled }
}
