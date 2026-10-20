import { createHash } from 'node:crypto';
import type { Database } from '../database.ts';
import { APIProblem } from '../errors.ts';

const MINUTE_MS = 60_000;
/** Per-client and per-subject buckets kept per minute; the shared ceiling is never subject to this cap. */
const MAX_BUCKETS = 65536;
/**
 * Emergency ceiling for the whole sign-in endpoint. Far above normal traffic, so a handful of addresses cannot
 * lock everyone out; per-client and per-subject buckets do the real limiting,
 * and only requests they let through count against it.
 */
const GLOBAL_PER_MINUTE = 3000;
const digest = (scope: string, value: string) => createHash('sha256').update(`${scope}:${value}`).digest('hex');
const SUBJECT_FORMAT = {
  challenge: /^0x[0-9a-f]{40}$/,
  verify: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
} as const;

function ipv6Groups(ip: string): string[] {
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return groups.map(group => group.replace(/^0+(?=.)/, ''));
}

/** IPv6 clients usually hold a whole /64, so they are limited per /64; IPv4 (also IPv4-mapped) per address. */
export function clientKey(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (!ip.includes(':')) return ip;
  return `${ipv6Groups(ip).slice(0, 4).join(':')}::/64`;
}

/** The /48 an IPv6 client's /64 belongs to (one site or one tunnel account); undefined for IPv4. */
export function networkKey(ip: string): string | undefined {
  if (!ip.includes(':') || /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip)) return undefined;
  return `${ipv6Groups(ip).slice(0, 3).join(':')}::/48`;
}

/** Fixed minute windows, shared through PostgreSQL; proxy headers are never an IP authority. */
export class AuthRateLimiter {
  private readonly db: Database;
  private readonly now: () => Date;
  private readonly globalPerMinute: number;

  constructor(db: Database, now: () => Date = () => new Date(), options: { globalPerMinute?: number } = {}) {
    this.db = db;
    this.now = now;
    this.globalPerMinute = options.globalPerMinute ?? GLOBAL_PER_MINUTE;
  }

  async consume(kind: 'challenge' | 'verify', ip: string, subject: unknown): Promise<void> {
    const normalized = typeof subject === 'string' ? subject.toLowerCase() : '';
    // A malformed request would be refused by validation anyway; refusing it here keeps it away from the database.
    if (!SUBJECT_FORMAT[kind].test(normalized)) throw new APIProblem(400, 'invalid_request', 'Invalid sign-in request.');
    // Checked in this order and stopped at the first refusal: a request refused for its network, address or subject
    // never counts against the shared ceiling, so one client cannot use it up for everyone.
    const network = networkKey(ip);
    const buckets = [
      ...(network ? [{ key: digest(`${kind}:net`, network), limit: kind === 'challenge' ? 30 : 60, shared: false }] : []),
      { key: digest(`${kind}:ip`, clientKey(ip)), limit: kind === 'challenge' ? 10 : 20, shared: false },
      { key: digest(`${kind}:subject`, normalized), limit: kind === 'challenge' ? 3 : 5, shared: false },
      { key: digest('global', 'auth'), limit: this.globalPerMinute, shared: true },
    ];
    const accepted = await this.db.transaction(async tx => {
      // Serializes bounded bucket insertion and maintenance across independent API workers.
      await tx.query('SELECT pg_advisory_xact_lock(483972)');
      // A queued request may cross a window boundary while waiting for a connection or lock.
      const now = this.now();
      if (!Number.isFinite(now.getTime())) throw new Error('Invalid authentication clock.');
      const time = now.toISOString();
      const expires = new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS).toISOString();
      const maintenance = await tx.query(`UPDATE auth_maintenance SET cleaned_at = $1
        WHERE id = 1 AND cleaned_at <= $2 RETURNING id`, [time, new Date(now.getTime() - MINUTE_MS).toISOString()]);
      if (maintenance.rows.length) {
        await tx.query('DELETE FROM siwe_sessions WHERE expires_at <= $1', [time]);
        await tx.query(`DELETE FROM siwe_challenges c WHERE c.expires_at <= $1
          AND NOT EXISTS (SELECT 1 FROM siwe_sessions s WHERE s.challenge_id = c.id)`, [time]);
      }
      // Short-lived buckets are removed on every request, including at a window boundary.
      await tx.query('DELETE FROM auth_rate_buckets WHERE expires_at <= $1', [time]);
      const count = await tx.query<{ count: string }>('SELECT count(*) AS count FROM auth_rate_buckets');
      let remaining = MAX_BUCKETS - Number(count.rows[0]!.count);
      for (const bucket of buckets) {
        const existing = await tx.query<{ hits: number }>('SELECT hits FROM auth_rate_buckets WHERE bucket_key = $1', [bucket.key]);
        if (!existing.rows.length && !bucket.shared) {
          // A full table must not lock everyone out: new clients then rely on the shared ceiling alone.
          if (remaining <= 0) continue;
          remaining--;
        }
        // Saturation avoids integer overflow under a flood while retaining the denial until expiry.
        const next = await tx.query<{ hits: number }>(`INSERT INTO auth_rate_buckets (bucket_key, hits, expires_at)
          VALUES ($1, 1, $2) ON CONFLICT (bucket_key) DO UPDATE
          SET hits = least(auth_rate_buckets.hits + 1, $3) RETURNING hits`, [bucket.key, expires, bucket.limit + 1]);
        if (next.rows[0]!.hits > bucket.limit) return false;
      }
      // Denials still commit the counts up to the refusing bucket. No challenge/session is created here.
      return true;
    });
    if (!accepted) throw new APIProblem(429, 'auth_rate_limited', 'Too many sign-in attempts. Try again in one minute.');
  }
}
