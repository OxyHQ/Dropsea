-- oxy:deploy-phase=pre

CREATE TABLE "file_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text GENERATED ALWAYS AS (lower("file_tags"."name")) STORED NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT date_trunc('milliseconds', now()) NOT NULL,
	CONSTRAINT "file_tags_owner_asset_name_key_unique" UNIQUE("owner_user_id","asset_id","name_key"),
	CONSTRAINT "file_tags_owner_asset_position_unique" UNIQUE("owner_user_id","asset_id","position"),
	CONSTRAINT "file_tags_name_check" CHECK (char_length("file_tags"."name") >= 1
        and octet_length("file_tags"."name") <= 255
        and btrim("file_tags"."name", ' ' || chr(9) || chr(13)) = "file_tags"."name"
        and strpos("file_tags"."name", ',') = 0
        and strpos("file_tags"."name", chr(10)) = 0),
	CONSTRAINT "file_tags_asset_id_length_check" CHECK (char_length("file_tags"."asset_id") between 1 and 255),
	CONSTRAINT "file_tags_position_check" CHECK ("file_tags"."position" >= 0)
);
--> statement-breakpoint
CREATE INDEX "file_tags_owner_name_key_idx" ON "file_tags" USING btree ("owner_user_id","name_key","id");