import { normalizeUsername } from "./db.js";

export const SALT_ROUNDS = 12;
// bcrypt only uses the first 72 bytes of a password.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,30}$/;

/** Returns the normalised username and password, or an error message for the client. */
export function validateNewCredentials(
  username: unknown,
  password: unknown,
): { username: string; password: string } | { error: string } {
  if (typeof username !== "string" || typeof password !== "string") {
    return { error: "Username and password are required." };
  }

  const normalized = normalizeUsername(username);

  if (!USERNAME_PATTERN.test(normalized)) {
    return {
      error: "Username must be 3-30 characters: letters, numbers, dots, underscores or hyphens.",
    };
  }

  if (password.length < PASSWORD_MIN_LENGTH || Buffer.byteLength(password) > PASSWORD_MAX_BYTES) {
    return {
      error: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_BYTES} characters.`,
    };
  }

  return { username: normalized, password };
}
