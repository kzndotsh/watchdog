CREATE TABLE "auth"."invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "auth"."session" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "role" text DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "banned" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "ban_expires" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "auth"."invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "auth"."invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "auth"."member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "auth"."member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_id_user_id_uidx" ON "auth"."member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "session_active_organization_id_idx" ON "auth"."session" USING btree ("active_organization_id");