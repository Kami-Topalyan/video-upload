import { randomUUID } from "node:crypto";
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { getUserById, isPgError, isUuid, pool, withTransaction } from "../db.js";
import { HttpError } from "../errors.js";
import { isFileKind, matchesKind, type FileKind } from "../fileKinds.js";
import { requireAdmin, requireAuth } from "../middleware/requireAuth.js";
import { createUpload, decodeUploadName, deleteStoredFile, storagePath } from "../storage.js";

export const roomsRouter = Router();

const ROOM_NAME_MAX = 150;
const MAX_MEMBERS_PER_REQUEST = 200;
const MAX_REQUIREMENTS = 20;
const REQUIREMENT_LABEL_MAX = 100;
const REQUIREMENT_COUNT_MAX = 50;

type Role = "owner" | "member";

const notFound = (res: Response, what = "Room") =>
  res.status(404).json({ error: `${what} not found.` });

// All room endpoints require authentication.
roomsRouter.use(requireAuth);

// Every /:roomId/... route first checks that the caller belongs to the room.
// Non-members get a 404 (not a 403) so room IDs can't be probed.
// The caller's role is left in res.locals.role for the handlers below.
roomsRouter.use(
  "/:roomId",
  async (req: Request<{ roomId: string }>, res: Response, next: NextFunction) => {
    const { roomId } = req.params;

    if (!isUuid(roomId)) {
      notFound(res);
      return;
    }

    const result = await pool.query<{ role: Role }>(
      `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, req.user!.sub],
    );

    if (!result.rows[0]) {
      notFound(res);
      return;
    }

    res.locals.role = result.rows[0].role;
    next();
  },
);

/** Only lets room owners through. `action` completes "Only the room owner can ...". */
const requireOwner =
  (action: string): RequestHandler =>
  (_req, res, next) => {
    if (res.locals.role !== "owner") {
      res.status(403).json({ error: `Only the room owner can ${action}.` });
      return;
    }
    next();
  };

const parseRoomName = (value: unknown): string | null => {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name.length <= ROOM_NAME_MAX ? name : null;
};

// =====================================================
// CREATE ROOM (ADMIN ONLY)
// POST /api/rooms
//   { name, memberIds?: string[], requirements: { kind, count, label? }[] }
// Every member must upload `count` files of `kind` for each requirement.
// =====================================================

interface ParsedRequirement {
  kind: FileKind;
  count: number;
  label: string | null;
}

/** Returns the cleaned requirements, or a message describing what is wrong. */
function parseRequirements(value: unknown): ParsedRequirement[] | string {
  if (!Array.isArray(value) || value.length === 0) {
    return "Add at least one upload requirement.";
  }
  if (value.length > MAX_REQUIREMENTS) {
    return `A room can have at most ${MAX_REQUIREMENTS} requirements.`;
  }

  const parsed: ParsedRequirement[] = [];

  for (const item of value as unknown[]) {
    const { kind, count, label } = (item ?? {}) as Record<string, unknown>;

    if (!isFileKind(kind)) return "Each requirement needs a valid file type.";

    if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > REQUIREMENT_COUNT_MAX) {
      return `Each requirement needs a file count between 1 and ${REQUIREMENT_COUNT_MAX}.`;
    }

    const cleanLabel = typeof label === "string" ? label.trim() : "";
    if (cleanLabel.length > REQUIREMENT_LABEL_MAX) {
      return `Requirement labels must be ${REQUIREMENT_LABEL_MAX} characters or fewer.`;
    }

    parsed.push({ kind, count: count as number, label: cleanLabel || null });
  }

  return parsed;
}

roomsRouter.post("/", requireAdmin, async (req, res) => {
  const userId = req.user!.sub;
  const name = parseRoomName(req.body?.name);

  if (!name) {
    res.status(400).json({
      error: `Room name is required and must be ${ROOM_NAME_MAX} characters or fewer.`,
    });
    return;
  }

  const requirements = parseRequirements(req.body?.requirements);

  if (typeof requirements === "string") {
    res.status(400).json({ error: requirements });
    return;
  }

  const rawIds: unknown = req.body?.memberIds ?? [];

  if (
    !Array.isArray(rawIds) ||
    rawIds.length > MAX_MEMBERS_PER_REQUEST ||
    !rawIds.every(isUuid)
  ) {
    res.status(400).json({ error: "Invalid room members." });
    return;
  }

  const memberIds = [...new Set(rawIds as string[])].filter((id) => id !== userId);

  const room = await withTransaction(async (client) => {
    const roomResult = await client.query(
      `INSERT INTO rooms (id, name, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, created_by, created_at`,
      [randomUUID(), name, userId],
    );
    const created = roomResult.rows[0];

    // The creator becomes the owner...
    await client.query(
      `INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [created.id, userId],
    );

    // ...and the selected users become members (IDs that match no user are ignored).
    if (memberIds.length > 0) {
      await client.query(
        `INSERT INTO room_members (room_id, user_id, role)
         SELECT $1, id, 'member' FROM users WHERE id = ANY($2::uuid[])`,
        [created.id, memberIds],
      );
    }

    for (const [position, requirement] of requirements.entries()) {
      await client.query(
        `INSERT INTO room_requirements (id, room_id, kind, label, count_required, position)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), created.id, requirement.kind, requirement.label, requirement.count, position],
      );
    }

    return created;
  });

  res.status(201).json({ room });
});

// =====================================================
// LIST MY ROOMS
// GET /api/rooms
// =====================================================

roomsRouter.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT
       r.id,
       r.name,
       r.created_by,
       r.created_at,
       rm.role,
       (SELECT COUNT(*)::int FROM room_files rf
        WHERE rf.room_id = r.id AND (rm.role = 'owner' OR rf.uploaded_by = $1)) AS file_count,
       (SELECT COUNT(*)::int FROM room_members m WHERE m.room_id = r.id) AS member_count
     FROM rooms r
     JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
     ORDER BY r.created_at DESC`,
    [req.user!.sub],
  );

  res.json({ rooms: result.rows });
});

// =====================================================
// ROOM DETAILS, MEMBERS AND FILES
// GET /api/rooms/:roomId
// =====================================================

roomsRouter.get("/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const isOwner = res.locals.role === "owner";

    const [room, requirements, members, counts, files] = await Promise.all([
    // 1. room
    pool.query(
      `SELECT id, name, created_by, created_at, updated_at FROM rooms WHERE id = $1`,
      [roomId],
    ),
    // 2. requirements (must stay 2nd so it has count_required!)
    pool.query<{ id: string; kind: FileKind; label: string | null; count_required: number }>(
      `SELECT id, kind, label, count_required
       FROM room_requirements WHERE room_id = $1 ORDER BY position`,
      [roomId],
    ),
    // 3. members (must stay 3rd!)
    pool.query<{
      id: string;
      username: string;
      role: Role;
      avatarId: string | null;
      joined_at: string;
    }>(
      `SELECT u.id, u.username, rm.role, u.avatar_id AS "avatarId", rm.joined_at
       FROM room_members rm
       JOIN users u ON u.id = rm.user_id
       WHERE rm.room_id = $1
       ORDER BY rm.joined_at`,
      [roomId],
    ),
    // 4. counts
    pool.query<{ uploaded_by: string; requirement_id: string; n: number }>(
      `SELECT uploaded_by, requirement_id, COUNT(*)::int AS n
       FROM room_files
       WHERE room_id = $1 AND uploaded_by IS NOT NULL AND requirement_id IS NOT NULL
       GROUP BY uploaded_by, requirement_id`,
      [roomId],
    ),

    // The owner sees everything; members only see (and can download) their own files.
    pool.query(
      `SELECT
         rf.id,
         rf.requirement_id,
         rf.original_name,
         rf.mime_type,
         rf.size_bytes,
         rf.created_at,
         rf.uploaded_by,
         u.username AS uploaded_by_username
       FROM room_files rf
       LEFT JOIN users u ON u.id = rf.uploaded_by
       WHERE rf.room_id = $1 AND ($2::boolean OR rf.uploaded_by = $3)
       ORDER BY rf.created_at DESC`,
      [roomId, isOwner, req.user!.sub],
    ),
  ]);

  if (!room.rows[0]) {
    notFound(res);
    return;
  }

  // Each member's progress: files uploaded per requirement. They are "complete"
  // once every requirement is met. Computed from the files, so deleting one undoes it.
  const uploadedBy = new Map<string, Record<string, number>>();
  for (const row of counts.rows) {
    const mine = uploadedBy.get(row.uploaded_by) ?? {};
    mine[row.requirement_id] = row.n;
    uploadedBy.set(row.uploaded_by, mine);
  }

  res.json({
    room: room.rows[0],
    role: res.locals.role,
    requirements: requirements.rows,
    members: members.rows.map((member) => {
      const uploaded = uploadedBy.get(member.id) ?? {};
      return {
        ...member,
        uploaded,
        complete:
          member.role === "member" &&
          requirements.rows.length > 0 &&
          requirements.rows.every((req) => (uploaded[req.id] ?? 0) >= req.count_required),
      };
    }),
    files: files.rows,
  });
});

// =====================================================
// RENAME ROOM (OWNER ONLY)
// PATCH /api/rooms/:roomId   { name }
// =====================================================

roomsRouter.patch("/:roomId", requireOwner("rename it"), async (req, res) => {
  const name = parseRoomName(req.body?.name);

  if (!name) {
    res.status(400).json({
      error: `A room name of up to ${ROOM_NAME_MAX} characters is required.`,
    });
    return;
  }

  const result = await pool.query(
    `UPDATE rooms SET name = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, name, created_by, created_at, updated_at`,
    [name, req.params.roomId],
  );

  res.json({ room: result.rows[0] });
});

// =====================================================
// DELETE ROOM (OWNER ONLY)
// DELETE /api/rooms/:roomId
// =====================================================

roomsRouter.delete("/:roomId", requireOwner("delete it"), async (req, res) => {
  const { roomId } = req.params;

  const storageNames = await withTransaction(async (client) => {
    const files = await client.query<{ storage_name: string }>(
      `SELECT storage_name FROM room_files WHERE room_id = $1`,
      [roomId],
    );
    await client.query(`DELETE FROM rooms WHERE id = $1`, [roomId]);
    return files.rows.map((row) => row.storage_name);
  });

  // Only remove the bytes once the database change has committed.
  await Promise.all(storageNames.map(deleteStoredFile));

  res.json({ message: "Room deleted successfully." });
});

// =====================================================
// ADD MEMBER (OWNER ONLY)
// POST /api/rooms/:roomId/members   { userId }
// =====================================================

roomsRouter.post("/:roomId/members", requireOwner("add members"), async (req, res) => {
  const userId: unknown = req.body?.userId;

  if (!isUuid(userId)) {
    res.status(400).json({ error: "A valid userId is required." });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (room_id, user_id) DO NOTHING
       RETURNING room_id, user_id, role, joined_at`,
      [req.params.roomId, userId],
    );

    if (!result.rowCount) {
      res.status(409).json({ error: "User is already a room member." });
      return;
    }

    res.status(201).json({ member: result.rows[0] });
  } catch (err) {
    if (isPgError(err, "23503")) {
      notFound(res, "User");
      return;
    }
    throw err;
  }
});

// =====================================================
// REMOVE MEMBER (OWNER ONLY)
// DELETE /api/rooms/:roomId/members/:userId
// =====================================================

roomsRouter.delete(
  "/:roomId/members/:userId",
  requireOwner("remove members"),
  async (req, res) => {
    const { roomId, userId } = req.params;

    if (userId === req.user!.sub) {
      res.status(400).json({
        error: "The owner cannot remove themselves. Transfer ownership first.",
      });
      return;
    }

    if (!isUuid(userId)) {
      notFound(res, "Room member");
      return;
    }

    const result = await pool.query(
      `DELETE FROM room_members
       WHERE room_id = $1 AND user_id = $2 AND role = 'member'
       RETURNING user_id`,
      [roomId, userId],
    );

    if (!result.rowCount) {
      notFound(res, "Room member");
      return;
    }

    res.json({ message: "Member removed successfully." });
  },
);

// =====================================================
// UPLOAD FILE (MEMBERS)
// POST /api/rooms/:roomId/requirements/:requirementId/files   (multipart, field "file")
// Each upload fills one slot of one requirement. Everything that can be checked from
// the URL (role, requirement, free slots) is checked before multer reads the body, and
// the file type is checked as soon as multer sees the file's headers, so a rejected
// multi-gigabyte upload is refused up front instead of after the transfer.
// =====================================================

interface Requirement {
  id: string;
  kind: FileKind;
  label: string | null;
  count_required: number;
  room_name: string;
}

const loadRequirementForUpload: RequestHandler<{ roomId: string; requirementId: string }> = async (
  req,
  res,
  next,
) => {
  if (res.locals.role !== "member") {
    throw new HttpError(403, "Only invited members may upload files.");
  }

  const { roomId, requirementId } = req.params;

  if (!isUuid(requirementId)) {
    notFound(res, "Requirement");
    return;
  }

  const result = await pool.query<Requirement & { uploaded: number }>(
    `SELECT rr.id, rr.kind, rr.label, rr.count_required,
            r.name AS room_name,
            (SELECT COUNT(*)::int FROM room_files rf
              WHERE rf.requirement_id = rr.id AND rf.uploaded_by = $3) AS uploaded
    FROM room_requirements rr
    JOIN rooms r ON r.id = rr.room_id
    WHERE rr.id = $1 AND rr.room_id = $2`,
    [requirementId, roomId, req.user!.sub],
  );

  const requirement = result.rows[0];

  if (!requirement) {
    notFound(res, "Requirement");
    return;
  }

  if (requirement.uploaded >= requirement.count_required) {
    throw new HttpError(409, "You have already uploaded every file this requirement asks for.");
  }

  res.locals.requirement = requirement satisfies Requirement;
  next();
};

const receiveFile: RequestHandler = async (req, res, next) => {
  try {
    const { kind, room_name } = res.locals.requirement as Requirement;

    const safeSegment = (s: string) =>
      s.normalize("NFKD")
        .replace(/[^\w.-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60) || "room";

    const user = await getUserById(req.user!.sub);
    if (!user) throw new HttpError(401, "User not found.");

    const uFileName = `${safeSegment(user.username)}-${safeSegment(room_name)}`;

    createUpload(
      (file) => matchesKind(kind, file.originalname, file.mimetype),
      uFileName,
    ).single("file")(req, res, next);
  } catch (err) {
    next(err);
  }
};

roomsRouter.post(
  "/:roomId/requirements/:requirementId/files",
  loadRequirementForUpload,
  receiveFile,
  async (req, res) => {
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "Please select a file to upload." });
      return;
    }

    const { roomId, requirementId } = req.params as { roomId: string; requirementId: string };
    const requirement = res.locals.requirement as Requirement;

    try {
      const saved = await withTransaction(async (client) => {
        // Serialise this member's uploads so two at once can't both take the last slot.
        await client.query(
          `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 FOR UPDATE`,
          [roomId, req.user!.sub],
        );

        const { rows } = await client.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM room_files
           WHERE requirement_id = $1 AND uploaded_by = $2`,
          [requirementId, req.user!.sub],
        );

        if (rows[0].n >= requirement.count_required) {
          throw new HttpError(409, "You have already uploaded every file this requirement asks for.");
        }

        const result = await client.query(
          `INSERT INTO room_files
             (id, room_id, uploaded_by, requirement_id, original_name, storage_name, mime_type, size_bytes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, room_id, uploaded_by, requirement_id, original_name, mime_type, size_bytes, created_at`,
          [
            randomUUID(),
            roomId,
            req.user!.sub,
            requirementId,
            decodeUploadName(file.originalname),
            file.filename,
            file.mimetype,
            file.size,
          ],
        );

        return result.rows[0];
      });

      res.status(201).json({ file: saved });
    } catch (err) {
      // Don't leave an orphaned file on disk if the database write failed.
      await deleteStoredFile(file.filename);
      throw err;
    }
  },
);

// =====================================================
// DOWNLOAD FILE
// GET /api/rooms/:roomId/files/:fileId
// =====================================================

roomsRouter.get("/:roomId/files/:fileId", async (req, res) => {
  const { roomId, fileId } = req.params;

  const result = isUuid(fileId)
    ? await pool.query<{ original_name: string; storage_name: string; size_bytes: string }>(
        `SELECT original_name, storage_name, size_bytes FROM room_files
         WHERE id = $1 AND room_id = $2 AND ($3::boolean OR uploaded_by = $4)`,
        [fileId, roomId, res.locals.role === "owner", req.user!.sub],
      )
    : null;

  const file = result?.rows[0];

  if (!file) {
    notFound(res, "File");
    return;
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Length", file.size_bytes);
  res.download(storagePath(file.storage_name), file.original_name, (err) => {
    if (err && !res.headersSent) {
      console.error(`Could not send stored file ${file.storage_name}:`, err);
      res.status(404).json({ error: "File is missing from storage." });
    }
  });
});

// =====================================================
// DELETE FILE (ROOM OWNER, OR A MEMBER'S OWN FILE)
// DELETE /api/rooms/:roomId/files/:fileId
// =====================================================

roomsRouter.delete("/:roomId/files/:fileId", async (req, res) => {
  const { roomId, fileId } = req.params;

  const result = isUuid(fileId)
    ? await pool.query<{ storage_name: string }>(
        // Same visibility as listing/downloading: members can only touch their own files.
        `SELECT storage_name FROM room_files
         WHERE id = $1 AND room_id = $2 AND ($3::boolean OR uploaded_by = $4)`,
        [fileId, roomId, res.locals.role === "owner", req.user!.sub],
      )
    : null;

  const file = result?.rows[0];

  if (!file) {
    notFound(res, "File");
    return;
  }

  await pool.query(`DELETE FROM room_files WHERE id = $1`, [fileId]);
  await deleteStoredFile(file.storage_name);

  res.status(204).end();
});
