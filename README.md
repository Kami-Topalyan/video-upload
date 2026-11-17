# Upload Platform

A file-collection app built around **rooms**. There is no sign-up: an **admin** gives people accounts (username + password), then creates a room, ticks the people who have to upload, and says what each of them must upload (e.g. *2 videos + 1 document*). Each person's tile in the room turns **green** once they have met every requirement.

- **Admins** create accounts and rooms, and see every file uploaded to their rooms.
- **Members** upload into the room's requirement slots (the file type and count are enforced by the API), and can only see and download their own files. Everyone in a room can see who is complete.

**React + TypeScript** (Vite, Tailwind) frontend · **Node + Express + TypeScript** API · **Postgres** · all run with **Docker Compose**.

## Quick start

```bash
cp .env.example .env     # then set POSTGRES_PASSWORD, JWT_SECRET, ADMIN_USERNAME and ADMIN_PASSWORD
docker compose up --build
```

Open <http://localhost:8080>. Uploaded files and the database live in Docker volumes (`uploads`, `postgres`), so they survive restarts.

### Development (hot reload)

```bash
docker compose -f docker-compose.dev.yml up
```

- Frontend: <http://localhost:5173> (Vite proxies `/api` to the API container)
- API: <http://localhost:4000>

On macOS/Windows, if edits aren't picked up, uncomment `VITE_USE_POLLING` in `docker-compose.dev.yml`.

### Without Docker

You need a Postgres database with `backend/db/init.sql` applied, and the `PG*`, `JWT_SECRET` and `UPLOAD_DIR` variables from `.env.example` set for the API.

```bash
cd backend  && npm install && npm run dev     # :4000
cd frontend && npm install && npm run dev     # :5173
```

Sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` and use **Create Account** to hand out logins. The admin account is created on first start; if the account already exists it is just promoted to admin (its password is untouched).

### Upgrading an existing database

`backend/db/init.sql` only runs when the Postgres volume is first created. If you already have a database from before users signed in with a **username** (it had an `email` column), apply the migration once:

```bash
docker compose exec -T db psql -U app -d app < backend/db/migrations/001_rename_email_to_username.sql
```

Existing accounts keep their old email as their username and can still log in with it. Or, if the data is disposable, start fresh with `docker compose down -v`.

If your database predates **admins and upload requirements**, also apply `002`, then set `ADMIN_USERNAME` so someone is promoted to admin:

```bash
docker compose exec -T db psql -U app -d app < backend/db/migrations/002_admins_and_requirements.sql
```

Files uploaded before this migration belong to no requirement, so they don't count towards anyone's progress.

## Structure

```
.
├── docker-compose.yml          # production-style stack (nginx + API + Postgres)
├── docker-compose.dev.yml      # hot-reload dev stack
├── backend/
│   ├── Dockerfile              # multi-stage, non-root, healthcheck
│   ├── db/
│   │   ├── init.sql            # schema for a fresh database
│   │   └── migrations/         # one-off upgrades for existing databases
│   └── src/
│       ├── index.ts            # app setup, error handling, graceful shutdown
│       ├── config.ts           # env-driven settings (fails fast if one is missing)
│       ├── db.ts               # pool, transaction helper, user queries
│       ├── storage.ts          # file bytes on disk (swap this for object storage)
│       ├── middleware/requireAuth.ts
│       └── routes/             # auth.ts, users.ts, rooms.ts
└── frontend/
    ├── Dockerfile              # build with Node, serve with nginx
    ├── nginx.conf.template     # static files + /api reverse proxy
    └── src/
        ├── api.ts              # API client (auth header, errors, upload progress)
        ├── hooks/              # useAuth, useUploads
        └── components/         # App pieces: rooms, uploads, file list, dialogs
```

## API

All endpoints except `health` and `login` need an `Authorization: Bearer <token>` header.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/health` | Liveness check (also pings the database) |
| POST | `/api/auth/login` | `{ username, password }` → `{ user, token }` |
| GET | `/api/auth/me` | The signed-in user |
| GET | `/api/users` | Every other user, for choosing room members (admin) |
| POST | `/api/users` | `{ username, password, isAdmin? }` — create an account (admin) |
| GET | `/api/rooms` | Rooms you belong to |
| POST | `/api/rooms` | `{ name, memberIds?, requirements: [{ kind, count, label? }] }` — you become the owner (admin) |
| GET | `/api/rooms/:roomId` | Room, your role, requirements, members (with progress + `complete`) and files you can see |
| PATCH | `/api/rooms/:roomId` | Rename (owner) |
| DELETE | `/api/rooms/:roomId` | Delete the room and its files (owner) |
| POST | `/api/rooms/:roomId/members` | `{ userId }` — add a member (owner) |
| DELETE | `/api/rooms/:roomId/members/:userId` | Remove a member (owner) |
| POST | `/api/rooms/:roomId/requirements/:requirementId/files` | Upload into a requirement (`multipart/form-data`, field `file`). 415 wrong type, 409 slots full |
| GET | `/api/rooms/:roomId/files/:fileId` | Download (owner: any file; member: own files) |
| DELETE | `/api/rooms/:roomId/files/:fileId` | Delete (owner: any file; member: own files) |

`kind` is one of `video`, `image`, `audio`, `document`, `archive`, `any` (extensions are listed in `backend/src/fileKinds.ts`), and `count` is 1–50. Requirements can't be edited after the room is created.

Usernames are case-insensitive, 3–30 characters of letters, numbers, dots, underscores or hyphens. Passwords are 8–72 characters.

## Configuration

| Variable | Default | Where | Purpose |
| -------- | ------- | ----- | ------- |
| `POSTGRES_PASSWORD` | — (required) | .env | Database password |
| `JWT_SECRET` | — (required) | .env | Signs login tokens |
| `WEB_PORT` | `8080` | .env | Host port for the web UI |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | .env | Admin account created (or promoted) on start-up |
| `MAX_FILE_SIZE_MB` | `5120` | .env | Per-file limit enforced by the API |
| `MAX_BODY_SIZE` | `6g` | web service | nginx request-body ceiling (keep it above `MAX_FILE_SIZE_MB`) |

## Not included yet (natural next steps)

- **Large files** — files stream to disk (up to `MAX_FILE_SIZE_MB`), but each upload is still a single request, so a dropped connection restarts that file, and downloads are buffered in the browser. Chunked/resumable uploads (e.g. S3-style multipart with presigned URLs) and signed download links would fix both.
- **Object storage** — `storage.ts` writes to local disk.
- **Validation** — file-type allow-list, virus scanning, per-user quotas.
- **Accounts** — password reset, changing a username, rate limiting on login.
- **Tests, linting, CI.**
