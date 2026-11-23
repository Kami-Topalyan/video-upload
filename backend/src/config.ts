import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// One .env drives everything: the project-root .env, the same one Docker Compose reads.
// (backend/.env is deliberately NOT read: a second file is how passwords drift apart.)
// Real environment variables beat the file.
const backendDir = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({ path: `${backendDir}../.env`, quiet: true });

import path from "node:path";

const positiveNumber = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

export const config = {
  port: positiveNumber(process.env.PORT, 4000),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || "./uploads"),
  // Per file. Big files are the point of this app, so the default is generous.
  maxFileSizeMb: positiveNumber(process.env.MAX_FILE_SIZE_MB, 5120),
  // Only needed when the browser talks to the API directly (e.g. no proxy in front).
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  // On start-up this account is created (needs the password) or promoted to admin.
  adminUsername: process.env.ADMIN_USERNAME || undefined,
  adminPassword: process.env.ADMIN_PASSWORD || undefined,
  jwtSecret: requiredEnv("JWT_SECRET"),
  jwtExpiresIn: "7d",
  db: {
    // Defaults match docker-compose, so a root .env with POSTGRES_PASSWORD is enough
    // to run the API on your machine against the compose database.
    host: process.env.PGHOST ?? "localhost",
    port: positiveNumber(process.env.PGPORT, 5432),
    database: process.env.PGDATABASE ?? "app",
    user: process.env.PGUSER ?? "app",
    password: process.env.PGPASSWORD ?? requiredEnv("POSTGRES_PASSWORD"),
  },
} as const;