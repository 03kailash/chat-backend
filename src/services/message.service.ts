import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { firestore } from '../db/firestore';
import { compareMessagePosition, requireTimestamp } from '../lib/chat-utils';
import { HttpError } from '../lib/http-error';
import { ensureChatExists, ensureMember } from './chat.service';

interface StoredMessage {
  senderId: string;
  text: string;
  createdAt: Timestamp;
  readReceipts?: Record<string, Timestamp>;
}

function messageCollection(chatId: string) {
  return firestore.collection('chats').doc(chatId).collection('messages');
}

function serializeMessage(id: string, data: StoredMessage) {
  const readReceipts = Object.fromEntries(
    Object.entries(data.readReceipts ?? {}).map(([uid, at]) => [uid, requireTimestamp(at).toDate().toISOString()]),
  );
  return {
    id,
    senderId: data.senderId,
    text: data.text,
    createdAt: requireTimestamp(data.createdAt).toDate().toISOString(),
    readReceipts,
  };
}

export async function sendMessage(chatId: string, senderId: string, text: string) {
  await ensureMember(chatId, senderId);
  const ref = messageCollection(chatId).doc();
  await ref.create({
    senderId,
    text,
    createdAt: FieldValue.serverTimestamp(),
    readReceipts: {},
  });
  const saved = await ref.get();
  return serializeMessage(ref.id, saved.data() as StoredMessage);
}

export async function getMessages(chatId: string, limit: number) {
  await ensureChatExists(chatId);
  // Fetch the most recent N, then return them chronologically (oldest first).
  const result = await messageCollection(chatId).orderBy('createdAt', 'desc').limit(limit).get();
  return result.docs.reverse().map((doc) => serializeMessage(doc.id, doc.data() as StoredMessage));
}

export async function markMessageRead(chatId: string, messageId: string, userId: string) {
  await ensureMember(chatId, userId);
  const ref = messageCollection(chatId).doc(messageId);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpError(404, 'Message not found in chat');
    const message = snapshot.data() as StoredMessage;
    if (message.senderId === userId) throw new HttpError(400, 'A sender cannot mark their own message as read');
    if (message.readReceipts?.[userId]) return; // idempotent: keep first read timestamp
    transaction.update(ref, new FieldPath('readReceipts', userId), FieldValue.serverTimestamp());
  });
  const updated = await ref.get();
  const receipt = (updated.data() as StoredMessage).readReceipts?.[userId];
  if (!receipt) throw new HttpError(500, 'Read receipt was not persisted');
  return { chatId, messageId, userId, readAt: requireTimestamp(receipt).toDate().toISOString() };
}

export async function updateLastSeen(chatId: string, userId: string, messageId: string) {
  await ensureMember(chatId, userId);
  const messageRef = messageCollection(chatId).doc(messageId);
  const seenRef = firestore.collection('chats').doc(chatId).collection('lastSeen').doc(userId);

  await firestore.runTransaction(async (transaction) => {
    // Transaction reads MUST precede writes.
    const message = await transaction.get(messageRef);
    const previous = await transaction.get(seenRef);
    if (!message.exists) throw new HttpError(404, 'Message not found in chat');
    const createdAt = requireTimestamp(message.get('createdAt'));

    if (previous.exists) {
      const oldTimestamp = previous.get('messageCreatedAt') as unknown;
      const oldMessageId = previous.get('messageId') as unknown;
      if (typeof oldMessageId === 'string' && oldTimestamp instanceof Timestamp &&
          compareMessagePosition(createdAt, messageId, oldTimestamp, oldMessageId) <= 0) {
        return; // Prevent last-seen cursor from moving backwards.
      }
    }
    transaction.set(seenRef, { userId, messageId, messageCreatedAt: createdAt, updatedAt: FieldValue.serverTimestamp() });
  });

  const current = await seenRef.get();
  if (!current.exists) throw new HttpError(500, 'Last seen was not persisted');
  return {
    chatId,
    userId,
    messageId: current.get('messageId') as string,
    updatedAt: requireTimestamp(current.get('updatedAt')).toDate().toISOString(),
  };
}
