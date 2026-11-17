import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { config } from "./config.js";
import { SALT_ROUNDS, validateNewCredentials } from "./credentials.js";
import { getUserByUsername, pool, saveUser } from "./db.js";

/**
 * Makes sure the account named by ADMIN_USERNAME exists and is an admin, so there is
 * always someone who can create rooms and hand out accounts. An existing account is
 * promoted (its password is left alone); a missing one is created from ADMIN_PASSWORD.
 */
export async function ensureAdmin(): Promise<void> {
  const { adminUsername, adminPassword } = config;

  if (!adminUsername) {
    const { rows } = await pool.query(`SELECT 1 FROM users WHERE is_admin LIMIT 1`);
    if (rows.length === 0) {
      console.warn("No admin account exists. Set ADMIN_USERNAME and ADMIN_PASSWORD to create one.");
    }
    return;
  }

  const existing = await getUserByUsername(adminUsername);

  if (existing) {
    if (!existing.isAdmin) {
      await pool.query(`UPDATE users SET is_admin = TRUE, updated_at = NOW() WHERE id = $1`, [
        existing.id,
      ]);
      console.log(`Promoted "${existing.username}" to admin.`);
    }
    return;
  }

  const credentials = validateNewCredentials(adminUsername, adminPassword);
  if ("error" in credentials) {
    throw new Error(`Cannot create the admin account from ADMIN_USERNAME/ADMIN_PASSWORD: ${credentials.error}`);
  }

  const now = new Date().toISOString();
  await saveUser({
    id: randomUUID(),
    username: credentials.username,
    passwordHash: await bcrypt.hash(credentials.password, SALT_ROUNDS),
    isAdmin: true,
    avatarId: null,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`Created admin account "${credentials.username}".`);
}
