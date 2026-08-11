/**
 * Generic API Key Pool with automatic failover / rotation.
 *
 * TypeScript port of the Python KeyPool (ingestion/key_pool.py).
 * Used by the API gateway's live-fetch routes to rotate API keys
 * when quota is exhausted or rate-limited.
 */

export enum KeyStatus {
  ACTIVE = 'active',
  EXHAUSTED = 'exhausted',
  INVALID = 'invalid',
}

export interface KeyState {
  key: string;
  status: KeyStatus;
  exhaustedAt: number | null;
  cooldownSeconds: number;
}

export class KeyPool {
  private keys: KeyState[];
  private cooldownSeconds: number;

  constructor(keys: string[], cooldownSeconds: number = 86400) {
    this.cooldownSeconds = cooldownSeconds;
    this.keys = keys
      .filter(k => k && k.trim().length > 0)
      .map(k => ({
        key: k.trim(),
        status: KeyStatus.ACTIVE,
        exhaustedAt: null,
        cooldownSeconds,
      }));
  }

  /** Total number of keys in the pool (including exhausted/invalid). */
  get size(): number {
    return this.keys.length;
  }

  /** Number of keys currently available for use. */
  get activeCount(): number {
    this.recoverExpiredCooldowns();
    return this.keys.filter(ks => ks.status === KeyStatus.ACTIVE).length;
  }

  /**
   * Return the first active key, or null if all are exhausted/invalid.
   */
  getActiveKey(): string | null {
    this.recoverExpiredCooldowns();
    for (const ks of this.keys) {
      if (ks.status === KeyStatus.ACTIVE) {
        return ks.key;
      }
    }
    return null;
  }

  /** Mark a key as quota-exhausted (will auto-recover after cooldown). */
  markExhausted(key: string): void {
    for (const ks of this.keys) {
      if (ks.key === key) {
        ks.status = KeyStatus.EXHAUSTED;
        ks.exhaustedAt = Date.now();
        console.warn(`[KeyPool] Key ...${key.slice(-4)} marked EXHAUSTED (cooldown=${ks.cooldownSeconds}s)`);
        return;
      }
    }
  }

  /** Mark a key as invalid (bad/revoked — NOT auto-recovered). */
  markInvalid(key: string): void {
    for (const ks of this.keys) {
      if (ks.key === key) {
        ks.status = KeyStatus.INVALID;
        console.error(`[KeyPool] Key ...${key.slice(-4)} marked INVALID (will not auto-recover)`);
        return;
      }
    }
  }

  /** Transition EXHAUSTED keys back to ACTIVE once their cooldown expires. */
  private recoverExpiredCooldowns(): void {
    const now = Date.now();
    for (const ks of this.keys) {
      if (
        ks.status === KeyStatus.EXHAUSTED &&
        ks.exhaustedAt !== null &&
        (now - ks.exhaustedAt) >= ks.cooldownSeconds * 1000  // convert to ms
      ) {
        console.log(`[KeyPool] Key ...${ks.key.slice(-4)} cooldown expired — recovering to ACTIVE`);
        ks.status = KeyStatus.ACTIVE;
        ks.exhaustedAt = null;
      }
    }
  }

  /**
   * Return a JSON-safe status report for each key in the pool.
   * Keys are identified by their last 4 characters only (security).
   */
  statusReport(): Array<{ key_suffix: string; status: string; exhausted_at: number | null }> {
    this.recoverExpiredCooldowns();
    return this.keys.map(ks => ({
      key_suffix: ks.key.length >= 4 ? ks.key.slice(-4) : '****',
      status: ks.status,
      exhausted_at: ks.exhaustedAt,
    }));
  }
}

/**
 * Load API keys from numbered environment variables.
 *
 * Scans PREFIX_1, PREFIX_2, ... PREFIX_20, then falls back
 * to the un-suffixed PREFIX for backward compatibility.
 */
export function loadKeysFromEnv(prefix: string): string[] {
  const keys: string[] = [];

  // Scan numbered suffixes: PREFIX_1 through PREFIX_20
  for (let i = 1; i <= 20; i++) {
    const val = (process.env[`${prefix}_${i}`] || '').trim();
    if (val) {
      keys.push(val);
    }
  }

  // Backward compatibility: if no numbered keys found, use un-suffixed var
  if (keys.length === 0) {
    const fallback = (process.env[prefix] || '').trim();
    if (fallback) {
      keys.push(fallback);
    }
  }

  return keys;
}

// ── Platform-specific quota/auth detection helpers ─────────────────────

/**
 * Check if a YouTube API response indicates quota exhaustion.
 */
export function isYouTubeQuotaExhausted(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status === 403) {
    const lower = body.toLowerCase();
    return lower.includes('quotaexceeded') || lower.includes('ratelimitexceeded');
  }
  return false;
}

/**
 * Check if a YouTube API response indicates an invalid key.
 */
export function isYouTubeKeyInvalid(status: number, body: string): boolean {
  if (status === 400 || status === 403) {
    return body.toLowerCase().includes('keyinvalid');
  }
  return false;
}

/**
 * Check if a Twitter API response indicates quota exhaustion.
 */
export function isTwitterQuotaExhausted(status: number, _body: string): boolean {
  return status === 429;
}

/**
 * Check if a Twitter API response indicates an invalid token.
 */
export function isTwitterKeyInvalid(status: number, _body: string): boolean {
  return status === 401;
}

/**
 * Check if a Telegram Bot API response indicates rate limiting.
 */
export function isTelegramQuotaExhausted(status: number, body: string): boolean {
  if (status === 429) return true;
  try {
    const data = JSON.parse(body);
    if (data.error_code === 429) return true;
  } catch {}
  return false;
}

/**
 * Check if a Telegram Bot API response indicates an invalid token.
 */
export function isTelegramKeyInvalid(status: number, _body: string): boolean {
  return status === 401;
}

/**
 * Check if a Meta Graph API response indicates rate limiting.
 */
export function isMetaQuotaExhausted(status: number, body: string): boolean {
  if (status === 429) return true;
  try {
    const data = JSON.parse(body);
    const errorCode = data?.error?.code;
    if ([4, 17, 32, 613].includes(errorCode)) return true;
  } catch {}
  return false;
}

/**
 * Check if a Meta Graph API response indicates an invalid token.
 */
export function isMetaKeyInvalid(status: number, body: string): boolean {
  try {
    const data = JSON.parse(body);
    if (data?.error?.code === 190) return true;
  } catch {}
  return false;
}
