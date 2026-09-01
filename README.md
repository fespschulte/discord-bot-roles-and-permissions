# Discord × Hotmart Subscription Bot

A Node.js service that keeps Discord roles in sync with Hotmart subscription status.

Members prove ownership of a Hotmart purchase with a single slash command, and from
that point on their access is maintained automatically: when Hotmart reports a
payment, cancellation or plan change, the bot grants or revokes the VIP role without
manual moderation.

## How it works

The service has two independent entry points that meet at the database.

```
Hotmart (billing events)              Discord member
        │                                   │
        │ POST /webhook/hotmart             │ /link email:<hotmart email>
        ▼                                   ▼
  Fastify route                      discord.js gateway
  Zod validation                     InteractionCreate
        │                                   │
        └────────► subscriptionService ◄─────┘
                          │
                          ▼
                  PostgreSQL (Drizzle)
                          │
                          ▼
                  VIP role add / remove
                          │
                          ▼
                   Discord REST API
```

Hotmart is the source of truth for entitlement. The database is a projection of it,
and the Discord role is derived from that projection rather than from any single
event. That means a member's correct role is always recoverable from stored state.

**Linking flow.** A member runs `/link` with the email used on Hotmart. If an active
subscription exists for that email, the Discord ID is stored against it and the VIP
role is granted. Replies are ephemeral, so a purchase email is never exposed in a
public channel.

**Webhook flow.** Hotmart posts subscription and purchase events. The request is
authenticated, validated, normalized into a single flat shape, upserted, and then — if
the email is already linked to a Discord account — translated into a role change.

**Entitlement.** Whether an event grants or revokes access is decided in one place,
`src/domain/entitlement.ts`, from the event name first and only then from
`subscription.status`. This matters because Hotmart's two status vocabularies overlap:
a `PURCHASE_APPROVED` payload can carry `purchase.status: "STARTED"`, and reading that
status instead of the event would revoke a member who has just paid. An event carrying
no status at all leaves the current role untouched rather than revoking it.

Access is granted while the subscription is `ACTIVE`, and revoked for every other
state, including late payment (`DELAYED`, `OVERDUE`) and unpaid billets.

**Reconciliation.** Discord calls can fail, so the role a member holds is re-derived
from the database on startup and then on an interval. This is what makes "the database
is the source of truth for roles" true rather than aspirational: a role change lost to
a Discord outage is repaired on the next sweep.

## Stack

| Concern             | Technology                                  |
| ------------------- | ------------------------------------------- |
| Language / runtime  | TypeScript 5 (strict), Node.js 20+          |
| Discord integration | discord.js v14 (gateway + REST)             |
| HTTP server         | Fastify 5                                   |
| Validation          | Zod 4, via `fastify-type-provider-zod`      |
| Database            | PostgreSQL with Drizzle ORM and postgres-js |
| Migrations          | drizzle-kit                                 |
| Tests               | Vitest                                      |
| Lint / format       | Biome (ultracite)                           |

Route schemas are the single source of both runtime validation and handler types, so
there is no gap between what an endpoint claims to accept and what its handler
assumes.

## Requirements

- Node.js 20 or newer
- A PostgreSQL database
- A Discord application with a bot user
- A Hotmart account able to configure webhooks

### Discord setup

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications) and add a bot user.
2. Under **Bot → Privileged Gateway Intents**, enable **Server Members Intent**. The
   bot needs it to resolve members and modify their roles.
3. Invite the bot to your server with the `bot` and `applications.commands` scopes and
   the **Manage Roles** permission.
4. Make sure the bot's own role sits **above** the VIP role in the server's role list.
   Discord does not allow a bot to assign roles at or above its own position.

The VIP role is created automatically on first use if it does not exist. Its name is
defined by `VIP_ROLE_NAME` in `src/bot/roles.ts`.

### Hotmart setup

Point a Hotmart webhook at `https://<your-host>/webhook/hotmart`. The handler
understands subscription lifecycle events (cancellation, plan switch, charge date
updates) and purchase events such as `PURCHASE_APPROVED`.

Copy the hottok Hotmart generates for the integration into `HOTMART_WEBHOOK_SECRET`.
Hotmart sends it in the `X-HOTMART-HOTTOK` header of every delivery, and the service
compares it in constant time before parsing the body. A missing or wrong token gets a
401, which Hotmart surfaces in its delivery log as an authentication failure.

## Getting started

```bash
git clone <repository-url>
cd bot-discord
npm install
cp .env.example .env   # then fill in the values
```

Apply the schema and, optionally, seed a test subscription:

```bash
npm run db:migrate
npm run db:seed
```

On a database that predates the `(email, guild_id)` constraint, check for rows that
would violate it before migrating, and decide how to merge them:

```sql
SELECT lower(trim(email)) AS email, guild_id, count(*)
FROM users GROUP BY 1, 2 HAVING count(*) > 1;
```

Start the service:

```bash
npm start
```

On startup the process validates the environment, registers the `/link` command with
your guild, connects to the Discord gateway, and begins listening for webhooks.

## Configuration

Variables are validated at startup by `src/env.ts`. The process exits immediately with
a readable error if any are missing or malformed, rather than failing later on the
first Discord login or database query.

| Variable                     | Description                                                        |
| ---------------------------- | ------------------------------------------------------------------ |
| `DISCORD_TOKEN`              | Bot token from the Developer Portal                                |
| `DISCORD_CLIENT_ID`          | Application ID, used to register slash commands                    |
| `DISCORD_GUILD_ID`           | Target server ID; commands are registered per guild                |
| `HOTMART_WEBHOOK_SECRET`     | Hottok Hotmart sends in `X-HOTMART-HOTTOK`; verified on every call  |
| `PORT`                       | HTTP port, defaults to `3333`                                      |
| `RECONCILE_INTERVAL_MINUTES` | How often roles are re-derived from the database, defaults to `15` |
| `DATABASE_URL`               | PostgreSQL connection string, must start with `postgresql://`      |

`drizzle.config.ts` imports the same validated environment, so `db:migrate` and
`db:generate` need a fully populated `.env` — not just `DATABASE_URL`.

## Scripts

| Script                | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `npm start`           | Run the service                                     |
| `npm run dev`         | Run in watch mode                                   |
| `npm run reconcile`   | Re-derive every role from the database once, then exit |
| `npm test`            | Run the test suite                                  |
| `npm run typecheck`   | `tsc --noEmit`                                      |
| `npm run lint`        | Biome check                                         |
| `npm run format`      | Biome check with fixes applied                      |
| `npm run db:generate` | Generate a migration from schema changes            |
| `npm run db:migrate`  | Apply pending migrations                            |
| `npm run db:seed`     | Insert a test subscription for local development    |

## HTTP endpoints

| Method | Path               | Purpose                                           |
| ------ | ------------------ | ------------------------------------------------- |
| `GET`  | `/health`          | Liveness check, returns `{ "status": "ok" }`      |
| `POST` | `/webhook/hotmart` | Receives Hotmart subscription and purchase events |

The webhook answers `401` when the hottok is missing or wrong, and `503` while the
Discord gateway is still connecting. The `503` is deliberate: Hotmart retries on `5xx`,
so a delivery that arrives during a restart is redelivered instead of being recorded
with its role change silently dropped. `/health` is intentionally unauthenticated.

## Data model

Two tables, both scoped by `guild_id` so a single deployment can serve more than one
Discord server.

**`subscriptions`** mirrors what Hotmart reports for a purchase: email, subscription
and subscriber identifiers, plan and product names, status, cancellation date and
next charge date. Unique on `(subscription_id, guild_id)`.

**`users`** maps a Discord account to the email that owns a purchase. Unique on
`(discord_id, guild_id)` and on `(email, guild_id)`, so one purchase cannot be claimed
by several Discord accounts. Emails are lowercased on every read and write, otherwise
changing capitalization would walk straight past that constraint.

The two are joined on email rather than by a foreign key, because the email is the
only identifier both systems share.

Both unique constraints exist so that every write can be an upsert
(`onConflictDoUpdate`) instead of a read-then-write. Replaying the same event
therefore produces the same result.

`status` is a PostgreSQL enum, so the database rejects any value outside the supported
set: `ACTIVE`, `INACTIVE`, `DELAYED`, `CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_SELLER`,
`CANCELLED_BY_ADMIN`, `STARTED`, `OVERDUE`. Unrecognized values from Hotmart are
narrowed to `INACTIVE` with a warning rather than being written blindly — the safer
default, since status decides whether paid access stays granted.

## Project structure

```
src/
├── index.ts                        # Entrypoint: HTTP server + Discord bot
├── server.ts                       # buildApp(): Fastify app and route registration
├── env.ts                          # Zod-validated environment
├── domain/
│   ├── entitlement.ts              # Event → grant / revoke / no change
│   └── hotmartEvent.ts             # Payload schemas and normalization
├── bot/
│   ├── bot.ts                      # Client, intents, /link command
│   ├── roles.ts                    # VIP role add/remove
│   └── state.ts                    # Gateway readiness flag
├── http/routes/
│   └── webhook-hotmart.ts          # Hottok check + webhook handler
├── services/
│   ├── subscriptionService.ts      # All database reads and writes
│   └── reconciliation.ts           # Re-derives roles from stored subscriptions
├── scripts/
│   └── reconcile.ts                # One-off reconciliation run
├── db/
│   ├── connection.ts               # Drizzle + postgres-js
│   ├── schema/                     # Table definitions
│   ├── migrations/                 # Generated SQL migrations
│   └── seed.ts                     # Local test data
└── utils/
    └── subscriptionStatus.ts       # Status allow-list and parser
```

Both entry points go through `subscriptionService`, so the command handler and the
webhook share one definition of what an active subscription is. The `domain` modules
are pure: no database, no Discord, no Fastify, which is what makes the entitlement
rules directly testable.

## Tests

```bash
npm test
```

Four focused suites, covering the parts where a mistake is expensive and invisible:
the entitlement mapping, the status allow-list, payload normalization against Hotmart's
documented examples, and webhook authentication through `app.inject()`. They need
neither a database nor a Discord connection.

The bot and the HTTP server run in the same process. This lets the webhook handler
call the already-connected Discord client directly, avoiding a queue or a second
deployable for a single-guild setup.

## Limitations and next steps

Known gaps, listed deliberately rather than left to be discovered:

- **Email ownership is self-asserted.** `/link` accepts any email the member types. The
  unique constraint means a purchase can only ever be claimed once, so the exposure is
  a race rather than open sharing, but a member who knows another customer's purchase
  email and gets there first still wins. A confirmation step — an emailed code, or a
  Hotmart-side lookup — would close it properly.
- **Recovery is a sweep, not a queue.** A role change lost to a Discord outage is
  repaired on the next reconciliation pass, so the worst case is up to
  `RECONCILE_INTERVAL_MINUTES` of staleness. A durable job queue would make it
  immediate, at the cost of another moving part.
- **Events are applied in arrival order.** Hotmart sends `creation_date` on every
  event, but it is not used to reject an older event that overtakes a newer one.
  Reconciliation limits the blast radius, since the newest stored row wins.
- **No CI.** The suite runs locally; nothing enforces it on push yet.
- **Single guild in practice.** The schema is multi-tenant, but commands are registered
  for one `DISCORD_GUILD_ID` and the webhook attributes every event to it.
- **The VIP role is matched by name.** Renaming it in Discord makes the bot create a
  new one. Storing a role ID in configuration would be more robust.
