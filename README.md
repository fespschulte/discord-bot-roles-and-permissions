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

**Webhook flow.** Hotmart posts subscription and purchase events. The payload is
validated, normalized into a single flat shape, upserted, and then — if the email is
already linked to a Discord account — translated into a role change.

## Stack

| Concern             | Technology                                  |
| ------------------- | ------------------------------------------- |
| Language / runtime  | TypeScript 5 (strict), Node.js 20+          |
| Discord integration | discord.js v14 (gateway + REST)             |
| HTTP server         | Fastify 5                                   |
| Validation          | Zod 4, via `fastify-type-provider-zod`      |
| Database            | PostgreSQL with Drizzle ORM and postgres-js |
| Migrations          | drizzle-kit                                 |
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
defined by `VIP_ROLE_NAME` in `src/bot/bot.ts`.

### Hotmart setup

Point a Hotmart webhook at `https://<your-host>/webhook/hotmart`. The handler
understands subscription lifecycle events (cancellation, plan switch, charge date
updates) and purchase events such as `PURCHASE_APPROVED`.

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

Start the service:

```bash
npm start
```

On startup the process validates the environment, registers the `/link` command with
your guild, connects to the Discord gateway, and begins listening for webhooks.

## Configuration

All variables are required and validated at startup by `src/env.ts`. The process
exits immediately with a readable error if any are missing or malformed, rather than
failing later on the first Discord login or database query.

| Variable                 | Description                                                   |
| ------------------------ | ------------------------------------------------------------- |
| `DISCORD_TOKEN`          | Bot token from the Developer Portal                           |
| `DISCORD_CLIENT_ID`      | Application ID, used to register slash commands               |
| `DISCORD_GUILD_ID`       | Target server ID; commands are registered per guild           |
| `HOTMART_WEBHOOK_SECRET` | Shared secret for authenticating webhooks (see Limitations)   |
| `PORT`                   | HTTP port, defaults to `3333`                                 |
| `DATABASE_URL`           | PostgreSQL connection string, must start with `postgresql://` |

`drizzle.config.ts` imports the same validated environment, so `db:migrate` and
`db:generate` need a fully populated `.env` — not just `DATABASE_URL`.

## Scripts

| Script                | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `npm start`           | Run the service                                  |
| `npm run dev`         | Run in watch mode                                |
| `npm run db:generate` | Generate a migration from schema changes         |
| `npm run db:migrate`  | Apply pending migrations                         |
| `npm run db:seed`     | Insert a test subscription for local development |

## HTTP endpoints

| Method | Path               | Purpose                                           |
| ------ | ------------------ | ------------------------------------------------- |
| `GET`  | `/health`          | Liveness check, returns `{ "status": "ok" }`      |
| `POST` | `/webhook/hotmart` | Receives Hotmart subscription and purchase events |

## Data model

Two tables, both scoped by `guild_id` so a single deployment can serve more than one
Discord server.

**`subscriptions`** mirrors what Hotmart reports for a purchase: email, subscription
and subscriber identifiers, plan and product names, status, cancellation date and
next charge date. Unique on `(subscription_id, guild_id)`.

**`users`** maps a Discord account to the email that owns a purchase. Unique on
`(discord_id, guild_id)`.

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
├── server.ts                       # Fastify app, plugins, route registration
├── env.ts                          # Zod-validated environment
├── bot/
│   ├── bot.ts                      # Client, intents, /link command
│   └── roles.ts                    # VIP role add/remove
├── http/routes/
│   └── webhook-hotmart.ts          # Hotmart webhook handler
├── services/
│   └── subscriptionService.ts      # All database reads and writes
├── db/
│   ├── connection.ts               # Drizzle + postgres-js
│   ├── schema/                     # Table definitions
│   ├── migrations/                 # Generated SQL migrations
│   └── seed.ts                     # Local test data
└── utils/
    └── subscriptionStatus.ts       # Status allow-list and parser
```

Both entry points go through `subscriptionService`, so the command handler and the
webhook share one definition of what an active subscription is.

The bot and the HTTP server run in the same process. This lets the webhook handler
call the already-connected Discord client directly, avoiding a queue or a second
deployable for a single-guild setup.

## Limitations and next steps

Known gaps, listed deliberately rather than left to be discovered:

- **Webhook authenticity is not verified.** `HOTMART_WEBHOOK_SECRET` is configured but
  not yet checked against incoming requests, so any well-formed POST to
  `/webhook/hotmart` is trusted. This is the highest-priority fix.
- **Email ownership is self-asserted.** `/link` accepts any email the member types; a
  member who knows another customer's purchase email could claim their access. A
  confirmation step (emailed code, or Hotmart-side lookup) would close this.
- **Role updates depend on the gateway being connected.** If Discord is unreachable
  when an event arrives, the database is updated but the role change is lost. A
  periodic reconciliation job comparing roles against stored subscriptions would make
  the system self-healing.
- **No automated tests or CI.** The webhook normalization logic and status parsing are
  the natural first candidates.
- **Single guild in practice.** The schema is multi-tenant, but commands are registered
  for one `DISCORD_GUILD_ID` and the webhook falls back to a default guild.
