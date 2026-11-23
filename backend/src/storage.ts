import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import multer from "multer";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

// Everything that touches file bytes lives here, so swapping local disk for
// object storage later only means changing this module and the routes that call it.

export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(config.uploadDir, { recursive: true });
}

/** Absolute path of a stored file, given the storage_name saved in the database. */
export const storagePath = (storageName: string): string =>
  path.join(config.uploadDir, storageName);

/** Delete a stored file. A file that is already gone is not an error. */
export async function deleteStoredFile(storageName: string): Promise<void> {
  try {
    await fs.unlink(storagePath(storageName));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Could not delete stored file ${storageName}:`, err);
    }
  }
}

// Multer decodes multipart filenames as latin1; re-decode so non-ASCII names survive.
// Also strips any directory part and fits the database column (VARCHAR(255)).
export const decodeUploadName = (name: string): string =>
  path.basename(Buffer.from(name, "latin1").toString("utf8")).slice(0, 255);

/**
 * Streams a single uploaded file to disk under a random name. `accept` runs as soon as
 * the file's headers arrive (before any bytes are written), so a wrong file type is
 * refused without storing it.
 */
const pad = (n: number, len = 2) => String(n).padStart(len, "0");

const localStamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
  `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

// Finds default date format of obs
const extractDate = (name: string): string | null => {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})[ _T](\d{2})[-:.](\d{2})[-:.](\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  // Reject impossible dates like month 13 or hour 25.
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59 || +s > 59) return null;
  return `${y}-${mo}-${d}_${h}-${mi}-${s}`;
};

export const createUpload = (
  accept: (file: { originalname: string; mimetype: string }) => boolean,
  baseName: string,
) =>
  multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, config.uploadDir),
      filename: (_req, file, cb) => {
        const original = Buffer.from(file.originalname, "latin1").toString("utf8");
        const ext = path.extname(original).toLowerCase().replace(/[^.\w]/g, "").slice(0, 10);
        // use date from file or if not found generate one of the current time
        const date = extractDate(original) ?? localStamp();
        cb(null, `${baseName}-${date}-${randomBytes(3).toString("hex")}${ext}`);
      },
    }),
    limits: { fileSize: config.maxFileSizeMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const name = Buffer.from(file.originalname, "latin1").toString("utf8");
      if (accept({ originalname: name, mimetype: file.mimetype })) cb(null, true);
      else cb(new HttpError(415, "That file type isn't accepted for this requirement."));
    },
  });
