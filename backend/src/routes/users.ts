import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { SALT_ROUNDS, validateNewCredentials } from "../credentials.js";
import {
  getUserById,
  isPgError,
  listOtherUsers,
  saveUser,
  saveUserAvatar,
  type User,
  type UserAvatar,
} from "../db.js";
import { requireAdmin, requireAuth } from "../middleware/requireAuth.js";
import { publicUser } from "./auth.js";

export const usersRouter = Router();

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // Reject files larger than 2 MB
  },
  fileFilter: (_req, file, cb) => {
    // Only allow standard image MIME types
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed."));
    }
  },
});

// Everything here is admin-only: admins hand out accounts and pick who joins a room.
usersRouter.use(requireAuth, requireAdmin);

// GET /api/users — every other user, for picking room members.
usersRouter.get("/", async (req, res) => {
  res.json({ users: await listOtherUsers(req.user!.sub) });
});

// POST /api/users   { username, password, isAdmin? } — give someone an account.
usersRouter.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const credentials = validateNewCredentials(body.username, body.password);

  if ("error" in credentials) {
    res.status(400).json({ error: credentials.error });
    return;
  }

  const now = new Date().toISOString();
  const user: User = {
    id: randomUUID(),
    username: credentials.username,
    passwordHash: await bcrypt.hash(credentials.password, SALT_ROUNDS),
    isAdmin: body.isAdmin === true,
    avatarId: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await saveUser(user);
  } catch (err) {
    if (isPgError(err, "23505")) {
      res.status(409).json({ error: "Username is already taken." });
      return;
    }
    throw err;
  }

  res.status(201).json({ user: publicUser(user) });
});

// PATCH /api/users/:id/avatar — upload or replace a user's avatar.
usersRouter.patch(
  "/:id/avatar",
  upload.single("avatar"),
  async (req: Request<{ id: string }>, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No image file provided." });
      return;
    }

    const user = await getUserById(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    const now = new Date().toISOString();
    const avatar: UserAvatar = {
      id: randomUUID(),
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      imageData: new Uint8Array(req.file.buffer),
      createdAt: now,
      updatedAt: now,
    };

    // 1. Insert the binary image first so the foreign key exists
    await saveUserAvatar(avatar);

    // 2. Link the new avatarId on the user record
    user.avatarId = avatar.id;
    user.updatedAt = now;
    await saveUser(user);

    res.status(200).json({ user: publicUser(user) });
  },
);
