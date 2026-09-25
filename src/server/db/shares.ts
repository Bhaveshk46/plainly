/**
 * Storage for end-to-end-encrypted shared briefs (SQLite via node:sqlite).
 *
 * The server never sees plaintext or keys. What it stores per share:
 *   id           128-bit random capability (the link)
 *   iv/ciphertext opaque, encrypted in the browser
 *   delete_hash  SHA-256 of the creator's delete token (the token itself is
 *                never stored, and comparison is constant-time)
 *   expires_at   hard expiry; expired rows are unreadable at once and purged
 *
 * A row cap bounds disk use so an attacker cannot fill the database.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ShareCreated, ShareEnvelope } from '../../shared/types.js';

const HOUR_MS = 3_600_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export class ShareCapacityError extends Error {
  constructor() {
    super('The share store is full.');
    this.name = 'ShareCapacityError';
  }
}

export interface ShareStoreOptions {
  /** Maximum number of live shares. */
  maxRows?: number;
  /** Injectable clock (milliseconds since the epoch) for tests. */
  now?: () => number;
}

interface Row {
  id: string;
  iv: string;
  ciphertext: string;
  expires_at: number;
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export class ShareStore {
  readonly #db: DatabaseSync;
  readonly #maxRows: number;
  readonly #now: () => number;

  constructor(path: string, { maxRows = 5_000, now = Date.now }: ShareStoreOptions = {}) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    this.#maxRows = maxRows;
    this.#now = now;

    if (path !== ':memory:') this.#db.exec('PRAGMA journal_mode = WAL;');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        iv TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        delete_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS shares_expires_at ON shares (expires_at);
    `);
  }

  static isValidId(id: string): boolean {
    return ID_PATTERN.test(id);
  }

  create({ iv, ciphertext, ttlHours }: { iv: string; ciphertext: string; ttlHours: number }): ShareCreated {
    this.purgeExpired();
    if (this.count() >= this.#maxRows) throw new ShareCapacityError();

    const id = randomBytes(16).toString('base64url');
    const deleteToken = randomBytes(32).toString('base64url');
    const created = this.#now();
    const expires = created + ttlHours * HOUR_MS;
    this.#db
      .prepare('INSERT INTO shares (id, iv, ciphertext, delete_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, iv, ciphertext, hashToken(deleteToken), created, expires);
    return { id, deleteToken, expiresAt: new Date(expires).toISOString() };
  }

  /** The envelope, or undefined if the share does not exist or has expired. */
  get(id: string): ShareEnvelope | undefined {
    if (!ShareStore.isValidId(id)) return undefined;
    const row = this.#db.prepare('SELECT id, iv, ciphertext, expires_at FROM shares WHERE id = ?').get(id) as Row | undefined;
    if (!row) return undefined;
    if (row.expires_at <= this.#now()) {
      this.#db.prepare('DELETE FROM shares WHERE id = ?').run(id);
      return undefined;
    }
    return { id: row.id, iv: row.iv, ciphertext: row.ciphertext, expiresAt: new Date(row.expires_at).toISOString() };
  }

  /** Delete a share if `token` is its delete token. Unknown id and wrong token look identical. */
  delete(id: string, token: string): boolean {
    if (!ShareStore.isValidId(id) || !token) return false;
    const row = this.#db.prepare('SELECT delete_hash FROM shares WHERE id = ?').get(id) as { delete_hash: string } | undefined;
    if (!row) return false;
    const expected = Buffer.from(row.delete_hash, 'hex');
    const actual = Buffer.from(hashToken(token), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
    this.#db.prepare('DELETE FROM shares WHERE id = ?').run(id);
    return true;
  }

  /** Remove expired shares; returns how many were removed. */
  purgeExpired(): number {
    return Number(this.#db.prepare('DELETE FROM shares WHERE expires_at <= ?').run(this.#now()).changes);
  }

  count(): number {
    const row = this.#db.prepare('SELECT COUNT(*) AS n FROM shares').get() as { n: number };
    return Number(row.n);
  }

  close(): void {
    this.#db.close();
  }
}
