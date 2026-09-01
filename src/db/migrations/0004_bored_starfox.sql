-- Emails are normalized before the constraint is added, otherwise case variants of the same
-- address would each get their own row and defeat the uniqueness guarantee.
UPDATE "users" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));--> statement-breakpoint
UPDATE "subscriptions" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_guild_id_unique" UNIQUE("email","guild_id");
