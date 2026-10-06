CREATE TABLE "activity_floor" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"xid" "xid8" NOT NULL,
	"id" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_floor_singleton" CHECK ("activity_floor"."singleton")
);
