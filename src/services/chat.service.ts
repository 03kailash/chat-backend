import type { QueryResultRow } from 'pg';
import { pool } from '../db/postgres';
import { HttpError } from '../lib/http-error';
import { canonicalPair } from '../lib/chat-utils';

interface ChatRow extends QueryResultRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  created_at: Date;
}

export async function createOrGetChat(userAId: string, userBId: string): Promise<string> {
  const [aId, bId] = canonicalPair(userAId, userBId);
  const users = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE id = ANY($1::uuid[])',
    [[aId, bId]],
  );
  if (users.rowCount !== 2) throw new HttpError(404, 'Both users must exist');

  // ON CONFLICT makes concurrent requests safe; canonical ordering prevents duplicates.
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO chats (user_a_id, user_b_id)
     VALUES ($1, $2)
     ON CONFLICT (user_a_id, user_b_id) DO NOTHING
     RETURNING id`,
    [aId, bId],
  );
  const chatId = inserted.rows[0]?.id;
  if (chatId) return chatId;

  const existing = await pool.query<{ id: string }>(
    'SELECT id FROM chats WHERE user_a_id = $1 AND user_b_id = $2',
    [aId, bId],
  );
  if (!existing.rows[0]) throw new HttpError(500, 'Could not resolve the chat');
  return existing.rows[0].id;
}

export async function ensureChatExists(chatId: string): Promise<void> {
  const result = await pool.query<{ id: string }>('SELECT id FROM chats WHERE id = $1', [chatId]);
  if (!result.rows[0]) throw new HttpError(404, 'Chat not found');
}

export async function ensureMember(chatId: string, userId: string): Promise<void> {
  const result = await pool.query<Pick<ChatRow, 'user_a_id' | 'user_b_id'>>(
    'SELECT user_a_id, user_b_id FROM chats WHERE id = $1',
    [chatId],
  );
  const chat = result.rows[0];
  if (!chat) throw new HttpError(404, 'Chat not found');
  if (chat.user_a_id !== userId && chat.user_b_id !== userId) {
    throw new HttpError(403, 'User is not a member of this chat');
  }
}

export async function listUserChats(userId: string) {
  const user = await pool.query<{ id: string }>('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user.rows[0]) throw new HttpError(404, 'User not found');

  const result = await pool.query<ChatRow>(
    `SELECT id, user_a_id, user_b_id, created_at FROM chats
     WHERE user_a_id = $1 OR user_b_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return result.rows.map((chat) => ({
    chatId: chat.id,
    memberIds: [chat.user_a_id, chat.user_b_id],
    createdAt: chat.created_at.toISOString(),
  }));
}
