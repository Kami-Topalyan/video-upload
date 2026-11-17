-- Schema for a fresh database. Runs once, when the Postgres volume is first created.
-- Existing databases: see backend/db/migrations/.

-- 1. Create the avatars table first
CREATE TABLE IF NOT EXISTS user_avatars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mime_type VARCHAR(50) NOT NULL, -- e.g., 'image/webp', 'image/png'
    file_size INT NOT NULL,
    image_data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create users with the avatar_id foreign key column
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_id UUID REFERENCES user_avatars(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ROOMS
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ROOM MEMBERS
CREATE TABLE IF NOT EXISTS room_members (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

-- ROOM REQUIREMENTS
-- What every member of a room must upload: `count_required` files of one `kind`
-- (video, image, audio, document, archive or any). A member is "complete" once
-- they have met every requirement of the room.
CREATE TABLE IF NOT EXISTS room_requirements (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL
        CHECK (kind IN ('video', 'image', 'audio', 'document', 'archive', 'any')),
    label VARCHAR(100),
    count_required INTEGER NOT NULL CHECK (count_required BETWEEN 1 AND 50),
    position INTEGER NOT NULL DEFAULT 0
);

-- ROOM FILES
CREATE TABLE IF NOT EXISTS room_files (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    requirement_id UUID REFERENCES room_requirements(id) ON DELETE SET NULL,
    original_name VARCHAR(255) NOT NULL,
    storage_name VARCHAR(255) NOT NULL UNIQUE,
    mime_type VARCHAR(255),
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_room_members_user
    ON room_members(user_id);

CREATE INDEX IF NOT EXISTS idx_room_files_room
    ON room_files(room_id);

CREATE INDEX IF NOT EXISTS idx_room_requirements_room
    ON room_requirements(room_id);

CREATE INDEX IF NOT EXISTS idx_room_files_requirement
    ON room_files(requirement_id, uploaded_by);

CREATE INDEX IF NOT EXISTS idx_users_avatar_id
    ON users(avatar_id);