import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { createOrGetChat, listUserChats } from '../services/chat.service';
import { getMessages, markMessageRead, sendMessage, updateLastSeen } from '../services/message.service';

const router = Router();
const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const chatParams = z.object({ chatId: uuid });
const messageParams = chatParams.extend({ messageId: z.string().min(1).max(150) });
const userParams = z.object({ userId: uuid });

const safe = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

router.post('/chat/create', safe(async (req, res) => {
  const { userAId, userBId } = z.object({ userAId: uuid, userBId: uuid }).parse(req.body);
  const chatId = await createOrGetChat(userAId, userBId);
  res.status(200).json({ chatId });
}));

router.post('/chat/:chatId/message/send', safe(async (req, res) => {
  const { chatId } = chatParams.parse(req.params);
  const { senderId, text } = z.object({
    senderId: uuid,
    text: z.string().trim().min(1).max(5000),
  }).parse(req.body);
  const message = await sendMessage(chatId, senderId, text);
  res.status(201).json({ message });
}));

router.get('/chat/:chatId/messages', safe(async (req, res) => {
  const { chatId } = chatParams.parse(req.params);
  const { limit } = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).parse(req.query);
  const messages = await getMessages(chatId, limit);
  res.json({ chatId, limit, messages });
}));

router.post('/chat/:chatId/message/:messageId/read', safe(async (req, res) => {
  const { chatId, messageId } = messageParams.parse(req.params);
  const { userId } = z.object({ userId: uuid }).parse(req.body);
  const receipt = await markMessageRead(chatId, messageId, userId);
  res.json(receipt);
}));

router.post('/chat/:chatId/lastseen', safe(async (req, res) => {
  const { chatId } = chatParams.parse(req.params);
  const { userId, messageId } = z.object({
    userId: uuid,
    messageId: z.string().min(1).max(150),
  }).parse(req.body);
  const lastSeen = await updateLastSeen(chatId, userId, messageId);
  res.json(lastSeen);
}));

router.get('/user/:userId/chats', safe(async (req, res) => {
  const { userId } = userParams.parse(req.params);
  const chats = await listUserChats(userId);
  res.json({ userId, chats });
}));

export default router;
