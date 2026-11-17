import bcrypt from "bcrypt";
import { Router } from "express";
import { getUserById, getUserByUsername, type User } from "../db.js";
import { requireAuth, signToken } from "../middleware/requireAuth.js";

export const authRouter = Router();


export function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    avatarId: user.avatarId,
    avatarUrl: user.avatarId ? `/api/avatars/${user.avatarId}` : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// There is no public sign-up: accounts are created by an admin (POST /api/users).

// POST /api/auth/login
authRouter.post("/login", async (req, res) => {
  const { username, password } = (req.body ?? {}) as Record<string, unknown>;

  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Username and password are required." });
    return;
  }

  // Deliberately no format check here, so older accounts keep working.
  const user = await getUserByUsername(username);
  const valid = user !== null && (await bcrypt.compare(password, user.passwordHash));

  if (!user || !valid) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  res.json({ user: publicUser(user), token: signToken(user.id) });
});

// GET /api/auth/me — who does this token belong to?
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await getUserById(req.user!.sub);

  if (!user) {
    res.status(401).json({ error: "Account no longer exists." });
    return;
  }

  res.json({ user: publicUser(user) });
});
