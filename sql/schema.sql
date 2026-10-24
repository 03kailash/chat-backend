-- PostgreSQL 13+ (gen_random_uuid is provided in modern Postgres).
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Store UUIDs in canonical ascending order, so A+B and B+A are identical.
  CONSTRAINT distinct_chat_members CHECK (user_a_id < user_b_id),
  CONSTRAINT unique_direct_chat UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS chats_user_a_idx ON chats (user_a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chats_user_b_idx ON chats (user_b_id, created_at DESC);
