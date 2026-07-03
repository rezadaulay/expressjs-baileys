# WhatsApp Server

A lightweight, multi-tenant WhatsApp REST API server built with [Baileys](https://github.com/WhiskeySockets/Baileys) v7, Express, and TypeScript. Connect multiple WhatsApp accounts to a single server instance, each identified by a session name in the URL path, with all credentials persisted in a single SQLite file.

> **Disclaimer** — This project uses Baileys, an unofficial WhatsApp Web API library, and is not affiliated with, endorsed, or supported by WhatsApp/Meta. Accounts used with unofficial clients can be banned. Do not use it for spam or bulk messaging. For business-critical messaging, consider the official [WhatsApp Business Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api).

## Features

- **Multi-tenant** — run any number of WhatsApp accounts side by side; sessions are created on first use via the `/:session` path prefix
- **SQLite persistence** — auth credentials, Signal keys, and sent messages live in one `data/whatsapp.db` file (WAL mode); sessions survive restarts and reconnect automatically on boot
- **QR pairing** — scan once from a self-refreshing browser page; re-pairing is only needed after a logout or reset
- **Messaging** — send text and media (image, video, audio, document) by URL, with automatic media-type detection from the file extension
- **Number validation** — verify that a phone number is registered on WhatsApp before (or without) sending
- **Delivery reliability** — implements the Baileys `getMessage` retry contract backed by a sent-message store, an external retry-counter cache, and a cacheable Signal key store to avoid the "waiting for this message" class of failures
- **Operational endpoints** — restart a stuck socket, reset a corrupted session, or log a tenant out remotely
- **Tested** — unit and integration tests via the built-in Node.js test runner (no framework dependencies)

## Requirements

- Node.js **>= 20** (an `.nvmrc` is provided — run `nvm use`)
- A phone with WhatsApp to pair each session

## Installation

```bash
git clone <repository-url>
cd whatsapp-server
nvm use            # or ensure Node 20+ is active
npm install
cp .env.example .env
```

## Running

```bash
npm run dev        # development (watch mode)
npm run build      # compile TypeScript into dist/
npm start          # run the compiled production build
npm test           # run the test suite (uses an in-memory database)
```

The server automatically loads configuration from `.env` and listens on port `5000` by default. Environment variables supplied by the process override values from `.env`.

## Quick start

1. Start the server: `npm run dev`
2. Open `http://localhost:5000/my-account/qr` in a browser — this creates the session `my-account` and shows a QR code
3. On your phone: **WhatsApp → Linked Devices → Link a Device** → scan the QR
4. Check the connection: `curl http://localhost:5000/my-account/status`
5. Send a message:

```bash
curl -X POST http://localhost:5000/my-account/send-message \
  -H 'Content-Type: application/json' \
  -d '{"phone": "081234567890", "message": "Hello from the API!"}'
```

Session names may contain letters, digits, `-`, and `_` (max 32 characters). Each session is an independent WhatsApp account.

## API Reference

All endpoints except `GET /sessions` are prefixed with the session name: `/:session/...`.

### `GET /sessions`

List all active sessions and their connection status.

```json
[
  { "session": "my-account", "status": "connected", "user": { "id": "62812...@s.whatsapp.net", "name": "My Business" } }
]
```

### `GET /:session/status`

Connection state of one session: `connected`, `connecting`, or `disconnected`. Includes the WhatsApp account info when connected. Accessing a session for the first time creates it and starts connecting.

### `GET /:session/qr`

- Not yet paired → an HTML page with the current QR code (auto-refreshes every 20 seconds; the QR itself is rotated by WhatsApp)
- Already connected → `{ "message": "already connected" }`
- QR not generated yet → `404`, retry in a few seconds

### `GET /:session/check-number?phone=081234567890`

Check whether a number is registered on WhatsApp without sending anything.

```json
{ "phone": "6281234567890", "exists": true }
```

### `POST /:session/send-message`

Send a text message.

| Field | Type | Description |
|---|---|---|
| `phone` | string | Recipient number. Non-digits are stripped; a leading `0` is rewritten to `62` (Indonesia). |
| `message` | string | Message text. |

Responses: `200 {"success": true}`, `400` with a descriptive error (invalid number, not registered, not connected), or `500`.

### `POST /:session/send-media`

Send media from a public URL. The media type is detected from the URL's file extension.

| Field | Type | Description |
|---|---|---|
| `phone` | string | Recipient number (same normalization as above). |
| `media` | string | `http(s)` URL of the file. |
| `filename` | string? | Display filename for documents. Defaults to the URL basename. |
| `caption` | string? | Caption (ignored for audio — WhatsApp does not support audio captions). |

Detection: `png/jpg/jpeg` → image, `mp4` → video, `mp3/ogg/m4a` → audio, known document types (`pdf`, `csv`, `txt`, `zip`, `doc(x)`, `xls(x)`, `ppt(x)`) get their proper MIME type, anything else is sent as an `application/octet-stream` document. Media is streamed straight from the URL by Baileys — nothing is downloaded to local disk.

### `POST /:session/restart-socket`

Close and reopen the WebSocket while keeping credentials. Use when a connection looks stuck; the session reconnects automatically.

### `POST /:session/restart`

Full reset: wipe the session's credentials from the database and start fresh. A new QR must be scanned. Use when a session's encryption state is corrupted (e.g. persistent delivery failures).

### `POST /:session/logout`

Log out from WhatsApp (removes the linked device on the phone), delete the session's credentials, and remove the session from the server.

## Configuration

Copy the provided template before starting the server:

```bash
cp .env.example .env
```

The `.env` file is ignored by Git. Supported variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | HTTP port. |
| `WA_DB_PATH` | `./data/whatsapp.db` | SQLite database path. `:memory:` is supported (used by tests). |
| `WA_WEB_VERSION` | *(library default)* | Pin the advertised WA Web version, e.g. `2.3000.1033893291`. Escape hatch for server-side version rejections without redeploying. |

## Architecture

```
src/
├── index.ts          # Entry point: starts the HTTP server, restores saved sessions
├── app.ts            # Express app and routes (/:session router)
├── whatsapp.ts       # WhatsAppSession class (one Baileys socket per tenant) + session manager
├── auth-store.ts     # useSQLiteAuthState — Baileys auth state backed by SQLite
├── message-store.ts  # Sent-message store backing the getMessage retry contract
├── db.ts             # better-sqlite3 connection and schema
└── utils.ts          # Phone normalization, media-type detection
```

Storage is two tables in a single SQLite file:

- `auth_state (session_id, key, value)` — credentials and Signal keys, serialized with Baileys' `BufferJSON`. The key-value design is type-agnostic, so new Baileys key types (e.g. v7's `lid-mapping`, `device-list`, `tctoken`) are stored without schema changes.
- `sent_messages (session_id, msg_id, message, created_at)` — outgoing messages kept for 7 days so that recipient-initiated retries (`getMessage`) can re-serve them.

Reliability decisions worth knowing about (all born from real debugging):

- **`getMessage` + sent-message store** — when a recipient fails to decrypt, WhatsApp asks the sender to re-send; without this contract messages hang at one tick showing *"waiting for this message"* ([Baileys#1767](https://github.com/WhiskeySockets/Baileys/issues/1767))
- **Retry counter cache outside the socket** — survives reconnects, preventing encrypt/decrypt loops
- **`Browsers.ubuntu('Chrome')` identity** — since ~2026-06-30 WhatsApp rejects registration from legacy Desktop identities (WIN32/DARWIN) with a 428 before the QR is emitted ([Baileys#2677](https://github.com/WhiskeySockets/Baileys/issues/2677))
- **Reconnect backoff** — 5 seconds between attempts, except the immediate mandatory restart after pairing (code 515)

## Testing

```bash
npm test
```

Runs on the built-in `node:test` runner via `tsx`, against an in-memory SQLite database (`WA_DB_PATH=:memory:` is set by the npm script). Covers the SQLite auth store (Buffer round-trips, tenant isolation, deletions), the message store, phone normalization, media detection, and route validation. Anything requiring a live WhatsApp connection (pairing, actual delivery) is deliberately out of scope — verify those manually.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `428 Connection Terminated` before any QR | WhatsApp rejecting the client identity or version. This project already uses a browser identity; if it recurs, check recent [Baileys issues](https://github.com/WhiskeySockets/Baileys/issues) and try pinning `WA_WEB_VERSION`. |
| Recipient sees *"waiting for this message"* | The session's Signal state is corrupted. Try `POST /:session/restart-socket` first, then `POST /:session/restart` (re-scan). Also remove stale entries under **Linked Devices** on the phone. |
| `405 Connection Failure` | The advertised WA Web version is too old or rejected — set `WA_WEB_VERSION` to a known-good version. |
| Session logged out on its own | The phone unlinked the device or WhatsApp invalidated the session. Credentials are wiped automatically; scan a new QR. |
| No notifications on the paired phone | WhatsApp suppresses notifications while a linked device is "online". Set `markOnlineOnConnect: false` in the socket config if this matters for your use case. |

## License

MIT
