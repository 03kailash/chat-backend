# Chat Backend | PostgreSQL + Firebase Firestore

A **1:1 chat API** built with **Node.js, Express, strict TypeScript, PostgreSQL**, and **Firebase Admin / Cloud Firestore**.

## Architecture

- **PostgreSQL:** `users` + `chats` tables, foreign keys, canonical unique user pair.
- **Firestore:** `chats/{chatId}/messages/{messageId}` with server-generated timestamps and per-user `readReceipts` map; `chats/{chatId}/lastSeen/{userId}` tracks last seen message per user.
- **REST API:** Validates input with Zod; checks that user IDs belong to chats for all write operations.
- **Chat re-use:** `(A, B)` and `(B, A)` resolve to the same chat, including concurrent calls.

### Data model

```text
PostgreSQL
  users
    id UUID (PK)
    display_name TEXT
    created_at TIMESTAMPTZ
  chats
    id UUID (PK)
    user_a_id UUID (FK -> users.id)
    user_b_id UUID (FK -> users.id)
    created_at TIMESTAMPTZ
    UNIQUE(user_a_id, user_b_id) with ordered participants

Firestore
  chats/{chatId}/messages/{messageId}
    senderId: string
    text: string
    createdAt: Timestamp (server timestamp)
    readReceipts: { [userId]: Timestamp }
  chats/{chatId}/lastSeen/{userId}
    userId: string
    messageId: string
    messageCreatedAt: Timestamp
    updatedAt: Timestamp
```

Firestore does **not** store chat membership; PostgreSQL is authoritative. Firestore collections are populated on first message/last-seen write.

## Requirements

- Node.js 20+
- Docker Desktop (for PostgreSQL), or any reachable PostgreSQL 13+ instance
- Firebase project with Firestore enabled **or** Firebase Firestore local emulator (Firebase CLI; Java runtime required)

## Quick start (local emulation)

1. Install dependencies and create your environment file:

   ```bash
   npm install
   cp .env.example .env
   ```

2. Start PostgreSQL with three demo users automatically seeded:

   ```bash
   docker compose up -d postgres
   ```

   **Existing PostgreSQL instead:** create `chat_db` and run `sql/schema.sql`, then `sql/seed.sql`, and adjust `DATABASE_URL` in `.env`.

3. Start the Firestore emulator in a **second terminal** (the CLI may prompt for login/project setup if not already installed):

   ```bash
   npx firebase-tools emulators:start --only firestore --project chat-backend-demo
   ```

   The `.env` file should contain `FIREBASE_PROJECT_ID=chat-backend-demo` and `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`. The emulator UI is typically at `http://localhost:4000`.

4. Start the chat backend:

   ```bash
   npm run dev
   ```

   API base: `http://localhost:3000`; `GET /health` responds with `{ "status": "ok" }`.

### Real Firebase instead of emulator

1. In the Firebase console, create/select a project and enable **Cloud Firestore**.
2. Create an admin service account and securely store the credentials JSON **outside your repository**.
3. Edit `.env`: set your actual `FIREBASE_PROJECT_ID`, remove/comment `FIRESTORE_EMULATOR_HOST`, and set `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json`.
4. Ensure the service account has Firestore access.

The Firebase **Admin SDK bypasses Firestore Security Rules** and must only run in trusted backend environments.

## Endpoints

| Method | Endpoint | Input | Response |
|---|---|---|---|
| POST | `/chat/create` | `{userAId, userBId}` | `{chatId}` |
| POST | `/chat/:chatId/message/send` | `{senderId, text}` | `{message}` |
| GET | `/chat/:chatId/messages?limit=50` | `limit`: 1..100, default 50 | `{chatId, limit, messages}` |
| POST | `/chat/:chatId/message/:messageId/read` | `{userId}` | `{chatId, messageId, userId, readAt}` |
| POST | `/chat/:chatId/lastseen` | `{userId, messageId}` | `{chatId, userId, messageId, updatedAt}` |
| GET | `/user/:userId/chats` | URL user ID | `{userId, chats: [{chatId, memberIds, createdAt}]}` |

The messages endpoint returns the **newest N messages** in ascending chronological order (older to newer). For equal timestamps, Firestore document ID order gives deterministic ties. Read receipts are returned with each message. The first read timestamp is preserved when the same receipt is retried. Last-seen never moves backwards. Each user must exist in PostgreSQL before creating a chat.

## Test with curl or Postman

Sample IDs from `sql/seed.sql`:

```text
Alice:   11111111-1111-4111-8111-111111111111
Bob:     22222222-2222-4222-8222-222222222222
Charlie: 33333333-3333-4333-8333-333333333333
```

**1. Create/get chat**

```bash
curl -s -X POST http://localhost:3000/chat/create \
  -H 'Content-Type: application/json' \
  -d '{"userAId":"11111111-1111-4111-8111-111111111111","userBId":"22222222-2222-4222-8222-222222222222"}'
```

Save the `chatId` from the response:

```bash
CHAT_ID='REPLACE_WITH_CHAT_ID'
```

**2. Send message**

```bash
curl -s -X POST "http://localhost:3000/chat/$CHAT_ID/message/send" \
  -H 'Content-Type: application/json' \
  -d '{"senderId":"11111111-1111-4111-8111-111111111111","text":"Hello Bob!"}'
```

Save the `message.id` as `MESSAGE_ID`:

```bash
MESSAGE_ID='REPLACE_WITH_MESSAGE_ID'
```

**3. Fetch newest messages in chronological order**

```bash
curl -s "http://localhost:3000/chat/$CHAT_ID/messages?limit=50"
```

**4. Mark Alice's message read by Bob**

```bash
curl -s -X POST "http://localhost:3000/chat/$CHAT_ID/message/$MESSAGE_ID/read" \
  -H 'Content-Type: application/json' \
  -d '{"userId":"22222222-2222-4222-8222-222222222222"}'
```

**5. Update Bob's last-seen message**

```bash
curl -s -X POST "http://localhost:3000/chat/$CHAT_ID/lastseen" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"22222222-2222-4222-8222-222222222222\",\"messageId\":\"$MESSAGE_ID\"}"
```

**6. List Alice's chats**

```bash
curl -s http://localhost:3000/user/11111111-1111-4111-8111-111111111111/chats
```

## Check and build

```bash
npm run check   # strict TypeScript type-checking
npm test        # utility unit tests
npm run build   # compile to dist/
npm start       # run compiled app
```

## Status codes

- `200` for chat lookup/list/read/last-seen and message listing.
- `201` for message creation.
- `400` for invalid input or marking your own message read.
- `403` for nonmembers attempting chat writes.
- `404` for unknown users/chats/messages.
- `500` for unexpected internal errors.

## Scope and production considerations

This is an **assignment/demo backend**, not a fully production-ready chat platform.

- **Authentication is not included in the task contract.** The caller currently supplies `userId` / `senderId`, which could be forged. Before deployment add JWT/Firebase Auth verification, derive the authenticated identity server-side, authorize **GET messages** and **GET chats**, and never trust body identity fields alone.
- Add cursor pagination (`startAfter`) for messages older than the latest 100; page-size `limit` alone returns only the recent window.
- No Socket.IO/live delivery, push notifications, rate limiting, message retention, group chats, edit/delete or multi-database distributed transaction handling.
- Keep request validation, logs, HTTPS, rate limits, secrets management, backups, and Firestore cost/index monitoring in mind when deploying.
- The Firestore emulator does not enforce all production limitations/index requirements; integration-test against real Firestore before shipping.
