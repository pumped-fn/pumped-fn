CREATE TABLE "invoice_audit" (
	"sequence" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_pending" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice" jsonb NOT NULL,
	"enqueued_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_stored" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice" jsonb NOT NULL,
	"classification" jsonb NOT NULL,
	"imported_at" timestamp with time zone NOT NULL,
	"reminded_at" timestamp with time zone
);
