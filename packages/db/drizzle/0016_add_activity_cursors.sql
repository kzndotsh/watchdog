CREATE TABLE "activity_cursors" (
	"consumer" text PRIMARY KEY NOT NULL,
	"xid" "xid8" NOT NULL,
	"id" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
