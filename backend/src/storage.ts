import { randomUUID } from "node:crypto";
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
export const createUpload = (accept: (file: { originalname: string; mimetype: string }) => boolean) =>
  multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, config.uploadDir),
      filename: (_req, _file, cb) => cb(null, randomUUID()),
    }),
    limits: { fileSize: config.maxFileSizeMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      // Same re-decoding as decodeUploadName, so the extension check sees the real name.
      const name = Buffer.from(file.originalname, "latin1").toString("utf8");
      if (accept({ originalname: name, mimetype: file.mimetype })) cb(null, true);
      else cb(new HttpError(415, "That file type isn't accepted for this requirement."));
    },
  });
