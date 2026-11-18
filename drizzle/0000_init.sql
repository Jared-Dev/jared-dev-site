CREATE TABLE "fit_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" text NOT NULL,
	"identity_hash" text NOT NULL,
	"verdict" text NOT NULL,
	"type" text NOT NULL,
	"reason" text NOT NULL,
	"input" text NOT NULL,
	"strike_count" smallint NOT NULL,
	"turn" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fit_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fit_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fit_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"strikes" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"hash" text PRIMARY KEY NOT NULL,
	"offense_count" integer DEFAULT 0 NOT NULL,
	"cooldown_until" timestamp with time zone,
	"permanent_block" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_files" (
	"name" text PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_cache" (
	"prompt_hash" text NOT NULL,
	"content_hash" text NOT NULL,
	"response" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "response_cache_prompt_hash_content_hash_pk" PRIMARY KEY("prompt_hash","content_hash")
);
--> statement-breakpoint
CREATE TABLE "usage_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usage_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"ttl" text NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"cache_read_tokens" integer NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_usd" double precision NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fit_messages" ADD CONSTRAINT "fit_messages_session_id_fit_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."fit_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fit_messages_session_idx" ON "fit_messages" USING btree ("session_id","id");--> statement-breakpoint
CREATE INDEX "identities_blocked_idx" ON "identities" USING btree ("cooldown_until") WHERE "identities"."permanent_block" OR "identities"."cooldown_until" IS NOT NULL;