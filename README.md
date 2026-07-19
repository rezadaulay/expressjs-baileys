# WhatsApp Server

A lightweight WhatsApp REST API server built with [Baileys](https://github.com/WhiskeySockets/Baileys) v7, Express, and TypeScript. By default it runs as a single-tenant server with clean root-level endpoints like `/qr` and `/send-message`. When needed, you can switch to multi-tenant mode and manage multiple WhatsApp accounts side by side via the `/:session` path prefix, with all credentials persisted in a local JSON file by default.

> **Disclaimer** — This project uses Baileys, an unofficial WhatsApp Web API library, and is not affiliated with, endorsed, or supported by WhatsApp/Meta. Accounts used with unofficial clients can be banned. Do not use it for spam or bulk messaging. For business-critical messaging, consider the official [WhatsApp Business Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api).

## Support

If this project helps you, you can support its maintenance here:

- [GitHub Sponsors: @rezadaulay](https://github.com/sponsors/rezadaulay)

## Features

- **Single-tenant by default** — root-level endpoints (`/qr`, `/status`, `/send-message`, etc.) map to one configurable default session
- **Optional multi-tenant mode** — switch `WA_MODE=multi` to run any number of WhatsApp accounts side by side; sessions are created on first use via the `/:session` path prefix
- **File persistence by default** — auth credentials, Signal keys, and sent messages live in `data/whatsapp-store.json`; sessions survive restarts and reconnect automatically on boot without native build tools
- **Optional SQLite persistence** — switch to `WA_STORAGE_DRIVER=sqlite` when you want a single SQLite database file instead
- **QR pairing** — scan once from a self-refreshing browser page; re-pairing is only needed after a logout or reset
- **Messaging** — send text and media (image, video, audio, document) by URL, with automatic media-type detection from the file extension
- **Number validation** — verify that a phone number is registered on WhatsApp before (or without) sending
- **Delivery reliability** — implements the Baileys `getMessage` retry contract backed by a sent-message store, an external retry-counter cache, and a cacheable Signal key store to avoid the "waiting for this message" class of failures
- **Operational endpoints** — restart a stuck socket, reset a corrupted session, or log a tenant out remotely
- **Tested** — unit and integration tests via the built-in Node.js test runner (no framework dependencies)

## Requirements

- Node.js **>= 20** (an `.nvmrc` is provided — run `nvm use`)
- A phone with WhatsApp to pair the server's session, or one phone per session in multi-tenant mode

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
npm test           # run the test suite (uses a temporary file store)
```

The server automatically loads configuration from `.env` and listens on port `5000` by default. Environment variables supplied by the process override values from `.env`.

By default:

- `WA_MODE=single`
- `WA_DEFAULT_SESSION=default`
- `WA_DEFAULT_COUNTRY_CODE=62`

That means the server exposes root-level endpoints and stores credentials under the `default` session unless you change it.

## Quick start

1. Start the server: `npm run dev`
2. Open `http://localhost:5000/qr` in a browser — this prepares the default session and shows a QR code
3. On your phone: **WhatsApp → Linked Devices → Link a Device** → scan the QR
4. Check the connection: `curl http://localhost:5000/status`
5. Send a message:

```bash
curl -X POST http://localhost:5000/send-message \
  -H 'Content-Type: application/json' \
  -d '{"phone": "081234567890", "message": "Hello from the API!"}'
```

If you already have production data under another session name, set `WA_DEFAULT_SESSION` to that exact name before first boot in single-tenant mode. That avoids re-pairing and continues using the same stored credentials.

For phone normalization, the default behavior is:

- numbers starting with `0` are rewritten using `WA_DEFAULT_COUNTRY_CODE`
- numbers already in international form (with or without `+`) are left as-is after non-digits are stripped
- any request can override the default with an optional `countryCode`

## Multi-tenant mode

Set this in `.env`:

```bash
WA_MODE=multi
```

Then endpoints use a session prefix again:

```bash
curl http://localhost:5000/my-account/status

curl -X POST http://localhost:5000/my-account/send-message \
  -H 'Content-Type: application/json' \
  -d '{"phone": "081234567890", "countryCode": "62", "message": "Hello from the API!"}'
```

Session names may contain letters, digits, `-`, and `_` (max 32 characters). Each session is an independent WhatsApp account.

## API Reference

In `WA_MODE=single` (default), operational endpoints live at the root: `/status`, `/qr`, `/send-message`, etc.

In `WA_MODE=multi`, the same endpoints are prefixed with the session name: `/:session/...`.

### `GET /sessions`

List all active sessions and their connection status. Only available when `WA_MODE=multi`.

```json
[
  { "session": "my-account", "status": "connected", "user": { "id": "62812...@s.whatsapp.net", "name": "My Business" } }
]
```

### `GET /status` or `GET /:session/status`

Connection state of one session: `connected`, `connecting`, or `disconnected`. Includes the WhatsApp account info when connected. Accessing a session for the first time creates it and starts connecting.

### `GET /qr` or `GET /:session/qr`

- Not yet paired → an HTML page with the current QR code (auto-refreshes every 20 seconds; the QR itself is rotated by WhatsApp)
- Already connected → `{ "message": "already connected" }`
- QR not generated yet → `404`, retry in a few seconds

### `GET /check-number?phone=081234567890` or `GET /:session/check-number?phone=081234567890`

Check whether a number is registered on WhatsApp without sending anything.

Optional query param:

- `countryCode=44` — used only when `phone` starts with `0`

```json
{ "phone": "6281234567890", "exists": true }
```

### `POST /send-message` or `POST /:session/send-message`

Send a text message.

| Field | Type | Description |
|---|---|---|
| `phone` | string? | Recipient number. Non-digits are stripped; a leading `0` is rewritten using `countryCode`, or `WA_DEFAULT_COUNTRY_CODE` when omitted. Required unless `jid`/`chatId` is provided. |
| `jid` / `chatId` | string? | Direct WhatsApp JID target such as `6281234567890@s.whatsapp.net`, `159700305883342@lid`, or `120363...@g.us`. Use the webhook `chat_id` to reply to incoming messages. |
| `countryCode` | string? | Optional calling code override such as `62`, `1`, or `44`. Digits only, no `+`. |
| `message` | string | Message text. |

Responses: `200 {"success": true}`, `400` with a descriptive error (invalid number, not registered, not connected), or `500`.

### `POST /send-media` or `POST /:session/send-media`

Send media from a public URL. The media type is detected from the URL's file extension.

| Field | Type | Description |
|---|---|---|
| `phone` | string? | Recipient number (same normalization as above). Required unless `jid`/`chatId` is provided. |
| `jid` / `chatId` | string? | Direct WhatsApp JID target. Use the webhook `chat_id` to reply to incoming messages, including `@lid` chats. |
| `countryCode` | string? | Optional calling code override such as `62`, `1`, or `44`. Digits only, no `+`. |
| `media` | string | `http(s)` URL of the file. |
| `filename` | string? | Display filename for documents. Defaults to the URL basename. |
| `caption` | string? | Caption (ignored for audio — WhatsApp does not support audio captions). |

Detection: `png/jpg/jpeg` → image, `mp4` → video, `mp3/ogg/m4a` → audio, known document types (`pdf`, `csv`, `txt`, `zip`, `doc(x)`, `xls(x)`, `ppt(x)`) get their proper MIME type, anything else is sent as an `application/octet-stream` document. Media is streamed straight from the URL by Baileys — nothing is downloaded to local disk.

### `POST /restart-socket` or `POST /:session/restart-socket`

Close and reopen the WebSocket while keeping credentials. Use when a connection looks stuck; the session reconnects automatically.

### `POST /restart` or `POST /:session/restart`

Full reset: wipe the session's credentials from the database and start fresh. A new QR must be scanned. Use when a session's encryption state is corrupted (e.g. persistent delivery failures).

### `POST /logout` or `POST /:session/logout`

Log out from WhatsApp (removes the linked device on the phone), delete the session's credentials, and remove the session from the server.

## Configuration

## Incoming message webhooks

Enable reliable delivery with `WA_WEBHOOK_ENABLED=true`, `WA_WEBHOOK_URL`, and a non-empty `WA_WEBHOOK_SECRET`. Optional settings are `WA_WEBHOOK_TIMEOUT_MS` (10000), `WA_WEBHOOK_MAX_ATTEMPTS` (8), `WA_WEBHOOK_INCLUDE_GROUPS` (false), `WA_WEBHOOK_INCLUDE_FROM_ME` (false), and `WA_WEBHOOK_PROCESS_APPEND` (true).

Incoming `notify` and eligible `append` messages are written to a persistent outbox before any HTTP request. The dispatcher sends the stored JSON body with `X-WA-Event`, `X-WA-Event-ID`, `X-WA-Timestamp` (milliseconds), and `X-WA-Signature: sha256=<hex>`. Verify the signature as HMAC-SHA256 over `<timestamp>.<raw request body>` and reject timestamps older than five minutes:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
const timestamp = req.get('X-WA-Timestamp');
if (Math.abs(Date.now() - Number(timestamp)) > 300_000) throw new Error('stale webhook');
const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
const supplied = Buffer.from(req.get('X-WA-Signature').replace(/^sha256=/, ''), 'hex');
if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error('bad signature');
```

Payloads use event `whatsapp.message.received`, version `1.0`, and contain message text or media metadata only (never downloaded media/base64). JIDs, including `@lid` values, are opaque identifiers. If Baileys has a saved LID-to-phone mapping, the payload also includes optional `sender_pn_jid` and `sender_phone` fields; otherwise only the opaque `sender_id` is available. Retry delays are immediate, 5s, 15s, 1m, 5m, 15m, 1h, then 6h; retryable failures include network/timeouts, 408, 425, 429, and 5xx. Delivery is at-least-once, so receivers must deduplicate by `X-WA-Event-ID`/`event_id`.

The persistent `webhook_enabled_at` cutoff prevents pre-enable history from `append` being queued. It deliberately remains across restarts; remove that meta key manually to reset it. A newly paired session can still emit post-cutoff history as `delivery_context: "sync"`. File storage rewrites its JSON file per event and is intended for normal traffic; use SQLite for busy deployments. Message edits are currently first-write-wins under the message/event unique key.

## Idempotent sends

`POST /send-message` and `POST /send-media` accept an optional `idempotencyKey` string (1–255 characters). A repeated identical completed request returns the cached body plus `duplicate: true` without sending again. A same-key request still processing returns 409; reuse with different content returns 422. Records are retained for seven days. Because the WhatsApp send and idempotency update are not one transaction, a crash leaves a small ambiguity window; processing records become retryable after five minutes.

Copy the provided template before starting the server:

```bash
cp .env.example .env
```

The `.env` file is ignored by Git. Supported variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | HTTP port. |
| `WA_MODE` | `single` | Tenancy mode. Use `single` for root endpoints, or `multi` to require a `/:session` prefix and enable `GET /sessions`. |
| `WA_DEFAULT_SESSION` | `default` | Session name used when `WA_MODE=single`. Set this to an existing stored session name to reuse current credentials without re-pairing. |
| `WA_DEFAULT_COUNTRY_CODE` | `62` | Default calling code used when an incoming phone number starts with `0`. Can be overridden per request with `countryCode`. |
| `WA_STORAGE_DRIVER` | `file` | Persistent storage backend. Use `file` to avoid native dependencies, or `sqlite` if you have installed `better-sqlite3`. |
| `WA_FILE_STORE_PATH` | `./data/whatsapp-store.json` | JSON storage path used when `WA_STORAGE_DRIVER=file`. |
| `WA_DB_PATH` | `./data/whatsapp.db` | SQLite database path used when `WA_STORAGE_DRIVER=sqlite`. `:memory:` is supported for local experiments. |
| `WA_WEB_VERSION` | *(library default)* | Pin the advertised WA Web version, e.g. `2.3000.1033893291`. Escape hatch for server-side version rejections without redeploying. |
| `WA_WEBHOOK_ENABLED` | `false` | Enable persistent incoming-message webhook delivery. |
| `WA_WEBHOOK_URL` | — | Global HTTP/HTTPS receiver URL; required when enabled. |
| `WA_WEBHOOK_SECRET` | — | HMAC signing secret; required when enabled. |
| `WA_WEBHOOK_TIMEOUT_MS` | `10000` | Per-attempt HTTP timeout. |
| `WA_WEBHOOK_MAX_ATTEMPTS` | `8` | Maximum delivery attempts. |
| `WA_WEBHOOK_INCLUDE_GROUPS` | `false` | Include group messages. |
| `WA_WEBHOOK_INCLUDE_FROM_ME` | `false` | Include messages sent by this account. |
| `WA_WEBHOOK_PROCESS_APPEND` | `true` | Capture post-cutoff history-sync messages. |

### Using SQLite instead of file storage

SQLite is optional so normal installs do not need native build tools such as `make`, Python, and a compiler. To enable SQLite:

```bash
npm install better-sqlite3
```

Then set:

```bash
WA_STORAGE_DRIVER=sqlite
WA_DB_PATH=./data/whatsapp.db
```

If your deployment fails with `gyp ERR! stack Error: not found: make`, keep `WA_STORAGE_DRIVER=file` and do not install `better-sqlite3`.

## Architecture

```
src/
├── index.ts          # Entry point: starts the HTTP server, restores saved sessions
├── app.ts            # Express app and routes (root routes in single mode, /:session in multi)
├── config.ts         # Runtime tenancy config from env
├── session.ts        # Shared session-name validation
├── whatsapp.ts       # WhatsAppSession class (one Baileys socket per tenant) + session manager
├── auth-store.ts     # Baileys auth state backed by the configured persistent store
├── message-store.ts  # Sent-message store backing the getMessage retry contract
├── storage.ts        # file/SQLite storage drivers
├── db.ts             # session-list compatibility helpers
└── utils.ts          # Phone normalization, media-type detection
```

Storage keeps auth, sent messages, webhook outbox/meta, and idempotent request collections in both backends:

- `auth_state` — credentials and Signal keys, serialized with Baileys' `BufferJSON`. The key-value design is type-agnostic, so new Baileys key types (e.g. v7's `lid-mapping`, `device-list`, `tctoken`) are stored without schema changes.
- `sent_messages` — outgoing messages kept for 7 days so that recipient-initiated retries (`getMessage`) can re-serve them.

Reliability decisions worth knowing about (all born from real debugging):

- **`getMessage` + sent-message store** — when a recipient fails to decrypt, WhatsApp asks the sender to re-send; without this contract messages hang at one tick showing *"waiting for this message"* ([Baileys#1767](https://github.com/WhiskeySockets/Baileys/issues/1767))
- **Retry counter cache outside the socket** — survives reconnects, preventing encrypt/decrypt loops
- **`Browsers.ubuntu('Chrome')` identity** — since ~2026-06-30 WhatsApp rejects registration from legacy Desktop identities (WIN32/DARWIN) with a 428 before the QR is emitted ([Baileys#2677](https://github.com/WhiskeySockets/Baileys/issues/2677))
- **Reconnect backoff** — 5 seconds between attempts, except the immediate mandatory restart after pairing (code 515)

## Testing

```bash
npm test
```

Runs on the built-in `node:test` runner via `tsx`, against a temporary file store. Covers the persistent auth store (Buffer round-trips, tenant isolation, deletions), the message store, phone normalization, media detection, and route validation. Anything requiring a live WhatsApp connection (pairing, actual delivery) is deliberately out of scope — verify those manually.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `428 Connection Terminated` before any QR | WhatsApp rejecting the client identity or version. This project already uses a browser identity; if it recurs, check recent [Baileys issues](https://github.com/WhiskeySockets/Baileys/issues) and try pinning `WA_WEB_VERSION`. |
| Recipient sees *"waiting for this message"* | The session's Signal state is corrupted. Try `POST /restart-socket` first (or `POST /:session/restart-socket` in multi mode), then `POST /restart` (re-scan). Also remove stale entries under **Linked Devices** on the phone. |
| `405 Connection Failure` | The advertised WA Web version is too old or rejected — set `WA_WEB_VERSION` to a known-good version. |
| `gyp ERR! stack Error: not found: make` during install | A native package is being installed, usually SQLite. The default `WA_STORAGE_DRIVER=file` path does not require `better-sqlite3`; remove it unless you intentionally use SQLite, or install system build tools before `npm install better-sqlite3`. |
| Session logged out on its own | The phone unlinked the device or WhatsApp invalidated the session. Credentials are wiped automatically; scan a new QR. |
| No notifications on the paired phone | WhatsApp suppresses notifications while a linked device is "online". Set `markOnlineOnConnect: false` in the socket config if this matters for your use case. |

## License

MIT
