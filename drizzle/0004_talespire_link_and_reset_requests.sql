ALTER TABLE "campaigns" ADD COLUMN "talespire_campaign_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_requested_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_talespire_campaign_id_key" ON "campaigns" USING btree ("talespire_campaign_id");