CREATE TABLE "docs" (
	"col" text,
	"id" text,
	"grp" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "docs_pkey" PRIMARY KEY("col","id")
);
--> statement-breakpoint
CREATE INDEX "docs_grp_idx" ON "docs" ("grp");