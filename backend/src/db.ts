import { Pool, types, type PoolClient } from "pg";
import { config } from "./config.js";

// BIGINT (e.g. file sizes) is returned as a string by default. Our values stay far below 2^53.
types.setTypeParser(types.builtins.INT8, (value) => Number(value));

export const pool = new Pool({
  ...config.db,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guard for values headed into UUID columns; Postgres throws on malformed ones. */
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_RE.test(value);

/** True if `err` is a Postgres error with the given SQLSTATE code (e.g. "23505" = unique violation). */
export const isPgError = (err: unknown, code: string): boolean =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === code;

/** Runs `fn` inside a transaction, committing on success and rolling back on any error. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ---- Users ----

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  avatarId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserAvatar {
  id: string;
  mimeType: string;
  fileSize: number;
  imageData: Uint8Array; // Maps to Buffer in Node.js or Uint8Array in edge runtimes
  createdAt: string;
  updatedAt: string;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  is_admin: boolean;
  avatar_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const mapUser = (row: UserRow): User => ({
  id: row.id,
  username: row.username,
  passwordHash: row.password_hash,
  isAdmin: row.is_admin,
  avatarId: row.avatar_id,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

/** Usernames are case-insensitive: they are stored and looked up in lowercase. */
export const normalizeUsername = (username: string): string =>
  username.trim().toLowerCase();

export async function getUserByUsername(username: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT * FROM users WHERE username = $1`,
    [normalizeUsername(username)],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function getUserById(id: string): Promise<User | null> {
  if (!isUuid(id)) return null;
  const result = await pool.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function saveUser(user: User): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, username, password_hash, is_admin, avatar_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      password_hash = EXCLUDED.password_hash,
      is_admin = EXCLUDED.is_admin,
      avatar_id = EXCLUDED.avatar_id,
      updated_at = EXCLUDED.updated_at`,
    [user.id, user.username, user.passwordHash, user.isAdmin, user.avatarId, user.createdAt, user.updatedAt],
  );
}

export async function saveUserAvatar(image: UserAvatar) {
  await pool.query(
    `INSERT INTO user_avatars (id, mime_type, file_size, image_data, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      mime_type = EXCLUDED.mime_type,
      file_size = EXCLUDED.file_size,
      image_data = EXCLUDED.image_data,
      updated_at = EXCLUDED.updated_at`,
    [image.id, image.mimeType, image.fileSize, image.imageData, image.createdAt, image.updatedAt],
  );
}
/** Everyone except `excludeId`, for pickers like "add members to a room". */
export async function listOtherUsers(
  excludeId: string,
): Promise<{ id: string; username: string }[]> {
  const result = await pool.query<{ id: string; username: string }>(
    `SELECT id, username FROM users WHERE id <> $1 ORDER BY username`,
    [excludeId],
  );
  return result.rows;
}
