import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { ensureAdmin } from "./bootstrap.js";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { pool } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { roomsRouter } from "./routes/rooms.js";
import { usersRouter } from "./routes/users.js";
import { ensureUploadDir } from "./storage.js";
import { avatarsRouter } from "./routes/avatars.js";

await ensureUploadDir();


// Fail with something readable (not a stack trace) when the database can't be reached.
try {
  await pool.query("SELECT 1");
} catch (err) {
  const code = (err as { code?: string }).code;
  console.error("\nCannot connect to the database.");
  if (code === "28P01") {
    console.error(
      `The database rejected the password for user "${config.db.user}". This usually means .env\n` +
        "was changed after the database was first created (Postgres only sets the password once).\n\n" +
        "Fix, keeping your data:   ./scripts/fix-db-password.sh        (add 'dev' for the dev stack)\n" +
        "Or start from scratch:    docker compose down -v && docker compose up -d db\n",
    );
  } else if (code === "ECONNREFUSED" || code === "ENOTFOUND") {
    console.error(
      `Nothing is listening at ${config.db.host}:${config.db.port}. Start it with:\n` +
        "  docker compose -f docker-compose.dev.yml up -d db   (this publishes port 5432)\n",
    );
  } else {
    console.error(err);
  }
  process.exit(1);
}

await ensureAdmin();

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/avatars", avatarsRouter);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: `File is too large (max ${config.maxFileSizeMb} MB)` });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }

  // Client errors raised by Express itself, e.g. malformed JSON bodies.
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: "Bad request" });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`API listening on :${config.port} (uploads in ${config.uploadDir})`);
  console.log(process.env.UPLOAD_DIR)
});

const shutdown = () => {
  // Don't wait forever on uploads that are still streaming.
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);