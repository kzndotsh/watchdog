CREATE TABLE "auth"."auth_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."auth_event" ADD CONSTRAINT "auth_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_event_user_id_idx" ON "auth"."auth_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_event_created_at_idx" ON "auth"."auth_event" USING btree ("created_at");