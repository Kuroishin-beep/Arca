CREATE TYPE "public"."container_type" AS ENUM('character', 'party', 'world');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('gm', 'player');--> statement-breakpoint
CREATE TYPE "public"."view_type" AS ENUM('table', 'cards', 'grouped');--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid NOT NULL,
	"parent_block_id" uuid,
	"block_type" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_members" (
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	CONSTRAINT "campaign_members_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "container_objects" (
	"container_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"position" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "container_objects_container_id_object_id_pk" PRIMARY KEY("container_id","object_id")
);
--> statement-breakpoint
CREATE TABLE "containers" (
	"object_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "container_type" NOT NULL,
	"owner_id" uuid,
	"revealed" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "object_properties" (
	"object_id" uuid NOT NULL,
	"property_definition_id" uuid NOT NULL,
	"value" jsonb,
	CONSTRAINT "object_properties_object_id_property_definition_id_pk" PRIMARY KEY("object_id","property_definition_id")
);
--> statement-breakpoint
CREATE TABLE "object_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_object_id" uuid NOT NULL,
	"target_object_id" uuid NOT NULL,
	"block_id" uuid,
	"position" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "object_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_object_id" uuid NOT NULL,
	"relation_type_id" uuid NOT NULL,
	"target_object_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "object_type_memberships" (
	"object_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	CONSTRAINT "object_type_memberships_object_id_type_id_pk" PRIMARY KEY("object_id","type_id")
);
--> statement-breakpoint
CREATE TABLE "object_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name_singular" text NOT NULL,
	"name_plural" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "property_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"data_type" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relation_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "type_properties" (
	"type_id" uuid NOT NULL,
	"property_definition_id" uuid NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "type_properties_type_id_property_definition_id_pk" PRIMARY KEY("type_id","property_definition_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"discord_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view_properties" (
	"view_id" uuid NOT NULL,
	"property_definition_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "view_properties_view_id_property_definition_id_pk" PRIMARY KEY("view_id","property_definition_id")
);
--> statement-breakpoint
CREATE TABLE "views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"name" text NOT NULL,
	"view_type" "view_type" DEFAULT 'table' NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_container_id_containers_object_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("object_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_objects" ADD CONSTRAINT "container_objects_container_id_containers_object_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("object_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_objects" ADD CONSTRAINT "container_objects_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_properties" ADD CONSTRAINT "object_properties_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_properties" ADD CONSTRAINT "object_properties_property_definition_id_property_definitions_id_fk" FOREIGN KEY ("property_definition_id") REFERENCES "public"."property_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_references" ADD CONSTRAINT "object_references_source_object_id_objects_id_fk" FOREIGN KEY ("source_object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_references" ADD CONSTRAINT "object_references_target_object_id_objects_id_fk" FOREIGN KEY ("target_object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_references" ADD CONSTRAINT "object_references_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_relations" ADD CONSTRAINT "object_relations_source_object_id_objects_id_fk" FOREIGN KEY ("source_object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_relations" ADD CONSTRAINT "object_relations_relation_type_id_relation_types_id_fk" FOREIGN KEY ("relation_type_id") REFERENCES "public"."relation_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_relations" ADD CONSTRAINT "object_relations_target_object_id_objects_id_fk" FOREIGN KEY ("target_object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_type_memberships" ADD CONSTRAINT "object_type_memberships_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_type_memberships" ADD CONSTRAINT "object_type_memberships_type_id_object_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."object_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_types" ADD CONSTRAINT "object_types_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objects" ADD CONSTRAINT "objects_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_definitions" ADD CONSTRAINT "property_definitions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relation_types" ADD CONSTRAINT "relation_types_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "type_properties" ADD CONSTRAINT "type_properties_type_id_object_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."object_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "type_properties" ADD CONSTRAINT "type_properties_property_definition_id_property_definitions_id_fk" FOREIGN KEY ("property_definition_id") REFERENCES "public"."property_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_properties" ADD CONSTRAINT "view_properties_view_id_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_properties" ADD CONSTRAINT "view_properties_property_definition_id_property_definitions_id_fk" FOREIGN KEY ("property_definition_id") REFERENCES "public"."property_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_container_id_containers_object_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("object_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_object_idx" ON "blocks" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "campaign_members_user_idx" ON "campaign_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_container_idx" ON "comments" USING btree ("container_id");--> statement-breakpoint
CREATE INDEX "container_objects_object_idx" ON "container_objects" USING btree ("object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "container_objects_single_edge_idx" ON "container_objects" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "containers_owner_idx" ON "containers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "object_properties_value_idx" ON "object_properties" USING gin ("value");--> statement-breakpoint
CREATE INDEX "object_references_target_idx" ON "object_references" USING btree ("target_object_id");--> statement-breakpoint
CREATE INDEX "object_relations_source_idx" ON "object_relations" USING btree ("source_object_id");--> statement-breakpoint
CREATE INDEX "object_relations_target_idx" ON "object_relations" USING btree ("target_object_id");--> statement-breakpoint
CREATE INDEX "object_type_memberships_type_idx" ON "object_type_memberships" USING btree ("type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "object_types_name_key" ON "object_types" USING btree ("campaign_id","name_singular");--> statement-breakpoint
CREATE INDEX "objects_campaign_idx" ON "objects" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "objects_live_idx" ON "objects" USING btree ("campaign_id") WHERE "objects"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "property_definitions_name_key" ON "property_definitions" USING btree ("campaign_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_discord_id_key" ON "users" USING btree ("discord_id");--> statement-breakpoint
CREATE INDEX "views_container_idx" ON "views" USING btree ("container_id");