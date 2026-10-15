# Notification System

REST API where authenticated users manage their notifications and deliver them **asynchronously** through different channels (**email**, **sms**, **push**). Adding a new channel does not require changing existing logic.

## Features

- User registration with email and password
- Login that returns a JWT access token; every other endpoint requires a valid token
- Create a notification (title, content, channel, recipient) and schedule its delivery
- List my notifications (newest first)
- Update a notification while it is still pending or failed (a failed one is re-queued)
- Delete a notification (a pending one is never delivered)
- Asynchronous delivery by a background worker, with retries and exponential backoff
- Channel-specific delivery logic (simulated):
    - **Email:** validates the recipient, renders an HTML/text template, records the delivery
    - **SMS:** validates the phone number, enforces the 160-character limit, records number and date
    - **Push:** validates the device token, formats the payload, records the delivery status
- Delivery history per notification
- Users can only see and modify their own notifications
- Interactive API documentation with Swagger

## Techs

- Node.js 20+ (Docker image: Node 24)
- TypeScript 6.0.3
- Fastify 5.12.5
- Prisma 7.10.0 (with the `pg` driver adapter)
- PostgreSQL 16
- TypeBox 0.34 (DTO validation and OpenAPI schemas)
- Vitest 5.0.3
- Docker and Docker Compose

## Route

- Swagger UI: [API Swagger](http://localhost:3000/docs)
- OpenAPI document: http://localhost:3000/docs/json

---

## How to run the app

Requirements: Docker and Docker Compose.

```bash
chmod 755 up_dev.sh
./up_dev.sh
```

It creates `.env.docker` from `.env.docker.example` if needed, builds the images and starts `db`, `db-init` (migrations), `api` and `worker` in the foreground. Press `Ctrl+C` to stop.

- API: http://localhost:3000
- Swagger: [API Swagger](http://localhost:3000/docs)
- Scale workers: `docker compose up -d --scale worker=3`

## How to run the tests

Requirements: Docker and Docker Compose.

```bash
chmod 755 up_test.sh
./up_test.sh
```

It runs the unit and integration suites inside a container against the `db` service, then stops. The exit code is the test result (0 = all passed), so it can be used in CI.

### Environment variables

| Variable                  | Default            | Description                                                                                          |
| ------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | required           | PostgreSQL connection string. In Docker, `docker-compose.yml` overrides it to point to the `db` host |
| `JWT_SECRET`              | required           | HS256 secret, at least 32 characters. The app refuses to start without it                            |
| `JWT_EXPIRES_IN`          | `1h`               | Token lifetime                                                                                       |
| `PORT` / `HOST`           | `3000` / `0.0.0.0` | API port and host                                                                                    |
| `SWAGGER_ENABLED`         | `true`             | Serves `/docs`                                                                                       |
| `WORKER_IN_PROCESS`       | `false`            | Runs the worker inside the API process                                                               |
| `WORKER_POLL_INTERVAL_MS` | `1000`             | Wait between rounds when there is no work                                                            |
| `WORKER_BATCH_SIZE`       | `10`               | Notifications claimed per round                                                                      |
| `WORKER_MAX_ATTEMPTS`     | `5`                | Maximum attempts for transient failures                                                              |
| `WORKER_BACKOFF_BASE_MS`  | `2000`             | Exponential backoff base (2 s, 4 s, 8 s, ... capped at 1 h)                                          |
| `WORKER_LOCK_TIMEOUT_MS`  | `60000`            | After this time, a notification held by a crashed worker returns to the queue                        |

## API

Every endpoint except `/auth/*`, `/health` and `/docs` requires `Authorization: Bearer <token>`. Errors always have the shape `{ "error": "CODE", "message": "..." }`.

| Method | Route                           | Description                                     | Responses               |
| ------ | ------------------------------- | ----------------------------------------------- | ----------------------- |
| POST   | `/auth/register`                | Register with email and password                | 201, 400, 409           |
| POST   | `/auth/login`                   | Returns an access token                         | 200, 400, 401           |
| POST   | `/notifications`                | Create a notification and schedule its delivery | 201, 400, 401           |
| GET    | `/notifications`                | List my notifications (newest first)            | 200, 401                |
| PATCH  | `/notifications/:id`            | Update a `pending` or `failed` notification     | 200, 400, 401, 404, 409 |
| DELETE | `/notifications/:id`            | Delete a notification (any status)              | 204, 401, 404           |
| GET    | `/notifications/:id/deliveries` | Delivery attempt history                        | 200, 401, 404           |
| GET    | `/health`                       | Liveness check                                  | 200                     |

### Channels

The `recipient` format depends on the channel:

| Channel | `recipient`                                        | Example                                      |
| ------- | -------------------------------------------------- | -------------------------------------------- |
| `email` | email address                                      | `ana@example.com`                            |
| `sms`   | E.164 phone number                                 | `+14155550123`                               |
| `push`  | device token (32+ characters of `[A-Za-z0-9_:.-]`) | `fcm_token:abcdefghijklmnopqrstuvwxyz012345` |

Lifecycle: `pending → processing → sent | failed`. A transient failure goes back to `pending` with exponential backoff. A permanent failure (invalid recipient, SMS too long) or running out of attempts moves it to `failed`. Editing a `failed` notification re-queues it.

---

## Technical decisions

**Clean architecture.** Dependencies point inward:

```
src/
  domain/          entities, status rules, errors and ports (interfaces). No Fastify or Prisma
  application/     services (use cases): Auth, Notification, Delivery, DeliveryHistory, ChannelRegistry
  infrastructure/  adapters: Prisma repositories, argon2, JWT, channels, worker
  presentation/    HTTP: routes, DTOs (TypeBox), authentication hook, error handling, Swagger
  main/            composition root (manual dependency injection) and the server.ts / worker.ts entrypoints
```

The flow is `controller → service → repository → ORM → DB`, with the dependency inverted: services depend on domain interfaces (`NotificationRepository`, `DeliveryQueue`, `Channel`, `Clock`), and the implementations are wired in a single place: `src/main/container.ts`.
This makes services testable with in-memory fakes and lets the ORM or the queue change without touching business logic.

**Extensible channels (Strategy + Registry).**

Each channel implements `Channel { name; send(message) }` and returns a typed result (`sent` | `retryable` | `permanent`) instead of throwing, so the retry policy lives in one place (`DeliveryService`). Neither the services nor the worker know concrete channels: they look them up by name in the `ChannelRegistry`. The `channel` column is plain text, not an enum, so a new channel needs no migration. To add one:

1. Create `src/infrastructure/channels/<new>-channel.ts` implementing `Channel`.
2. Register it in `src/infrastructure/channels/index.ts`.

`test/integration/extensibility.test.ts` proves it with a `webhook` channel defined only in the test.

**Asynchronous delivery on PostgreSQL, no broker.**

The `notifications` table is the queue (`status`, `attempts`, `next_attempt_at`, `locked_at`): creating a notification and enqueuing it is a single atomic INSERT. The worker claims batches with `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`, so concurrent workers never take the same notification (there is a test with 6 parallel workers).

**Authentication and authorization.**

- Passwords hashed with **argon2id**; they are never returned.
- Login issues an **HS256 JWT** with an expiration. The same 401 is returned for an unknown email and a wrong password, and a dummy hash is verified so response timing does not reveal which accounts exist.
- The `userId` comes **only** from the verified token, never from the request body.
- Ownership is enforced in the query itself (`WHERE id = ? AND user_id = ?`): another user's notification is indistinguishable from a missing one.
- Edits use a status-conditional UPDATE, which avoids race conditions with the worker.

**Database.**

- Tables `users`, `notifications` and `delivery_attempts`, with `ON DELETE CASCADE` foreign keys.
- `email` is unique and stored lowercased.
- Indexes for listing (`user_id, created_at DESC`), worker polling (`status, next_attempt_at`) and history (`notification_id, attempted_at`).
- Channel-specific details stored as `jsonb`; `timestamptz` dates; migrations versioned with Prisma.

**DTOs and documentation.**

Each route's TypeBox schemas validate the input, filter the output (internal fields such as `userId` or `lockedAt` never leak) and generate the OpenAPI document, so Swagger cannot drift from the code.

**Injectable time.**

`Clock` is a port: backoff and recovery tests advance a fake clock instead of waiting. The application sets `next_attempt_at` with the same clock the worker uses, which avoids skew between the server clock and the database clock.

## Areas to improve

- Channel rules (for example the SMS 160-character limit) are validated at **delivery** time, not at creation: the API answers 201 and the notification becomes `failed` later. Each channel could expose a `validate()` method used at creation too, to answer 400 immediately.
- Providers are simulated, as the requirements ask. Real integrations would fit behind the same `Channel` interface.
- Polling adds up to `WORKER_POLL_INTERVAL_MS` of latency; PostgreSQL `LISTEN/NOTIFY` could reduce it.
- No refresh tokens, JWT revocation or rate limiting yet.
- A seed script would provide a working app with sample data out of the box.
- The runtime Docker image is about 800 MB because Prisma 7 pulls in heavy peer dependencies; it could be optimized.
- Phone numbers are only validated for E.164 format; a library such as `libphonenumber-js` could validate them per country.
- Deployment (for example a cloud provider with a managed PostgreSQL) and a CI pipeline running lint, typecheck and tests on every push.
