-- Adds admin accounts and per-room upload requirements. Safe to run more than once.
--
--   docker compose exec -T db psql -U app -d app < backend/db/migrations/002_admins_and_requirements.sql
--
-- After running it, set ADMIN_USERNAME (and ADMIN_PASSWORD if that account does not
-- exist yet) for the API. On start-up it creates or promotes that account.
--
-- Files uploaded before this migration have no requirement, so they do not count
-- towards anyone's progress. The old files_done counter is dropped: progress is
-- now computed from the files themselves, so deleting a file un-completes it.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS room_requirements (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL
        CHECK (kind IN ('video', 'image', 'audio', 'document', 'archive', 'any')),
    label VARCHAR(100),
    count_required INTEGER NOT NULL CHECK (count_required BETWEEN 1 AND 50),
    position INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE room_files
    ADD COLUMN IF NOT EXISTS requirement_id UUID REFERENCES room_requirements(id) ON DELETE SET NULL;

ALTER TABLE room_members DROP COLUMN IF EXISTS files_done;

CREATE INDEX IF NOT EXISTS idx_room_requirements_room ON room_requirements(room_id);
CREATE INDEX IF NOT EXISTS idx_room_files_requirement ON room_files(requirement_id, uploaded_by);
