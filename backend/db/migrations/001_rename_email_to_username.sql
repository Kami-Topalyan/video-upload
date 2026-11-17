-- Renames users.email to users.username. Safe to run more than once.
--
--   docker compose exec -T db psql -U app -d app < backend/db/migrations/001_rename_email_to_username.sql
--
-- Existing accounts keep their old value as their username (so an account that
-- signed up as "sam@example.com" now has the username "sam@example.com" and can
-- still log in with it). New usernames are limited to letters, numbers, dots,
-- underscores and hyphens.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'users'
          AND column_name = 'email'
    ) THEN
        ALTER TABLE users RENAME COLUMN email TO username;

        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key') THEN
            ALTER TABLE users RENAME CONSTRAINT users_email_key TO users_username_key;
        END IF;
    END IF;
END
$$;
