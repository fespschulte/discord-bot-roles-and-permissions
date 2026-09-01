CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"guild_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"subscriber_code" text,
	"plan_name" text,
	"plan_code" text,
	"product_name" text,
	"product_id" text,
	"status" text,
	"billing_type" text,
	"adoption_date" timestamp with time zone,
	"cancellation_date" timestamp with time zone,
	"date_next_charge" timestamp with time zone,
	"has_unpaid_recurrency" boolean,
	"last_update" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"email" text NOT NULL,
	"hotmart_user_id" text,
	"name" text,
	"phone" text,
	"status" text,
	"last_update" timestamp with time zone
);
