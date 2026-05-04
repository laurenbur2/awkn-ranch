-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "within_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"title" text,
	"permissions" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"added_by" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "within_staff_email_key" UNIQUE("email"),
	CONSTRAINT "within_staff_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'provider'::text, 'staff'::text, 'readonly'::text])),
	CONSTRAINT "within_staff_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]))
);
--> statement-breakpoint
ALTER TABLE "within_staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "within_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_email" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"details" text,
	"ip_hint" text,
	"timestamp" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "within_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "image_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt" text NOT NULL,
	"revised_prompt" text,
	"style" text,
	"aspect_ratio" text,
	"model" text DEFAULT 'gemini-2.5-flash-image',
	"public_url" text NOT NULL,
	"storage_path" text NOT NULL,
	"width" integer,
	"height" integer,
	"tags" text[] DEFAULT '{""}',
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "image_library" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wc_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"description" text,
	"price_cents" integer,
	"price_display" text,
	"duration" text,
	"category" text DEFAULT 'outpatient',
	"features" jsonb DEFAULT '[]'::jsonb,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wc_services_slug_key" UNIQUE("slug"),
	CONSTRAINT "wc_services_category_check" CHECK (category = ANY (ARRAY['outpatient'::text, 'retreat'::text]))
);
--> statement-breakpoint
ALTER TABLE "wc_services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wc_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"bio" text,
	"photo_url" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "wc_team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wc_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"content" text,
	"author" text,
	"category" text,
	"tags" text[],
	"featured_image_url" text,
	"published_at" timestamp with time zone,
	"is_published" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wc_posts_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "wc_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wc_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" text,
	"service_name" text NOT NULL,
	"provider_id" uuid,
	"booking_date" date NOT NULL,
	"booking_time" text NOT NULL,
	"client_first_name" text NOT NULL,
	"client_last_name" text NOT NULL,
	"client_email" text NOT NULL,
	"client_phone" text,
	"client_city" text,
	"client_state" text,
	"comments" text,
	"amount" integer,
	"status" text DEFAULT 'pending',
	"payment_status" text DEFAULT 'unpaid',
	"payment_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wc_bookings_payment_status_check" CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'deposit_paid'::text, 'paid'::text, 'refunded'::text])),
	CONSTRAINT "wc_bookings_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'no_show'::text]))
);
--> statement-breakpoint
ALTER TABLE "wc_bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wc_contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"city" text,
	"state" text,
	"message" text,
	"source" text DEFAULT 'contact_form',
	"status" text DEFAULT 'new',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wc_contact_submissions_status_check" CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'resolved'::text]))
);
--> statement-breakpoint
ALTER TABLE "wc_contact_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wc_newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"subscribed_at" timestamp with time zone DEFAULT now(),
	"is_active" boolean DEFAULT true,
	CONSTRAINT "wc_newsletter_subscribers_email_key" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "wc_newsletter_subscribers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wc_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"bio" text,
	"photo_url" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "wc_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wc_provider_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "wc_provider_schedules_day_of_week_check" CHECK ((day_of_week >= 0) AND (day_of_week <= 6))
);
--> statement-breakpoint
ALTER TABLE "wc_provider_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"email" text NOT NULL,
	"role" text DEFAULT 'public' NOT NULL,
	"display_name" text,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"avatar_url" text,
	"person_id" integer,
	"is_current_resident" boolean DEFAULT false,
	"invited_by" uuid,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"job_title_id" uuid,
	"can_schedule" boolean DEFAULT false NOT NULL,
	CONSTRAINT "app_users_auth_user_id_key" UNIQUE("auth_user_id"),
	CONSTRAINT "app_users_role_check" CHECK (role = ANY (ARRAY['oracle'::text, 'admin'::text, 'staff'::text, 'resident'::text, 'associate'::text, 'demo'::text, 'public'::text, 'prospect'::text]))
);
--> statement-breakpoint
ALTER TABLE "app_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'public' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"invited_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone DEFAULT (now() + '90 days'::interval),
	"email_sent_at" timestamp with time zone,
	"email_send_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_invitations_role_check" CHECK (role = ANY (ARRAY['oracle'::text, 'admin'::text, 'staff'::text, 'resident'::text, 'associate'::text, 'demo'::text, 'public'::text, 'prospect'::text])),
	CONSTRAINT "user_invitations_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text]))
);
--> statement-breakpoint
ALTER TABLE "user_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stripe_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_mode" boolean DEFAULT true NOT NULL,
	"secret_key" text NOT NULL,
	"publishable_key" text,
	"webhook_secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_active_per_mode" UNIQUE("test_mode","is_active")
);
--> statement-breakpoint
ALTER TABLE "stripe_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "todo_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"icon_svg" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "todo_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "todo_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"badge" text,
	"is_checked" boolean DEFAULT false,
	"checked_by" uuid,
	"checked_at" timestamp with time zone,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "todo_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"location" text,
	"type" text,
	"parent_id" uuid,
	"monthly_rate" integer,
	"weekly_rate" integer,
	"nightly_rate" integer,
	"rental_term" text,
	"standard_deposit" text,
	"sq_footage" integer,
	"min_residents" integer DEFAULT 1,
	"max_residents" integer,
	"beds_king" integer DEFAULT 0,
	"beds_queen" integer DEFAULT 0,
	"beds_double" integer DEFAULT 0,
	"beds_twin" integer DEFAULT 0,
	"beds_folding" integer DEFAULT 0,
	"bath_privacy" text,
	"bath_fixture" text,
	"gender_restriction" text DEFAULT 'none',
	"is_listed" boolean DEFAULT false,
	"is_secret" boolean DEFAULT false,
	"is_micro" boolean DEFAULT false,
	"can_be_dwelling" boolean DEFAULT false,
	"can_be_event" boolean DEFAULT false,
	"is_archived" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"min_nights" integer DEFAULT 1,
	"booking_category" text,
	"booking_name" text,
	"hourly_rate" numeric(10, 2),
	"overnight_rate" numeric(10, 2),
	"full_day_rate" numeric(10, 2),
	"cleaning_fee" numeric(10, 2) DEFAULT '0',
	"min_hours" integer DEFAULT 2,
	"staff_only" boolean DEFAULT false,
	"booking_display_order" integer DEFAULT 0,
	"space_type" text,
	"floor" text,
	"has_private_bath" boolean,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "spaces_booking_category_check" CHECK (booking_category = ANY (ARRAY['house_room'::text, 'rental_space'::text, 'wellness_room'::text])),
	CONSTRAINT "spaces_floor_check" CHECK (floor = ANY (ARRAY['downstairs'::text, 'upstairs'::text])),
	CONSTRAINT "spaces_space_type_check" CHECK (space_type = ANY (ARRAY['session'::text, 'lodging'::text, 'both'::text]))
);
--> statement-breakpoint
ALTER TABLE "spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "investor_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investor_access_email_key" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "investor_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "property_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "single_row" CHECK (id = 1)
);
--> statement-breakpoint
ALTER TABLE "property_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "booking_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"app_user_id" uuid,
	"guest_name" text,
	"guest_email" text,
	"guest_phone" text,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"nightly_rate" numeric(10, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"source" text DEFAULT 'direct',
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "booking_rooms_source_check" CHECK (source = ANY (ARRAY['direct'::text, 'airbnb'::text, 'vrbo'::text, 'phone'::text, 'walk_in'::text, 'online'::text])),
	CONSTRAINT "booking_rooms_status_check" CHECK (status = ANY (ARRAY['hold'::text, 'confirmed'::text, 'checked_in'::text, 'checked_out'::text, 'cancelled'::text, 'no_show'::text])),
	CONSTRAINT "min_2_nights" CHECK ((check_out - check_in) >= 2)
);
--> statement-breakpoint
ALTER TABLE "booking_rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "booking_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"app_user_id" uuid,
	"client_name" text,
	"client_email" text,
	"client_phone" text,
	"booking_type" text NOT NULL,
	"start_datetime" timestamp with time zone NOT NULL,
	"end_datetime" timestamp with time zone NOT NULL,
	"hourly_rate" numeric(10, 2),
	"flat_rate" numeric(10, 2),
	"cleaning_fee" numeric(10, 2) DEFAULT '0',
	"total_amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "booking_spaces_booking_type_check" CHECK (booking_type = ANY (ARRAY['hourly'::text, 'full_day'::text, 'overnight'::text])),
	CONSTRAINT "booking_spaces_status_check" CHECK (status = ANY (ARRAY['hold'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]))
);
--> statement-breakpoint
ALTER TABLE "booking_spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_user_id" uuid,
	"display_name" text NOT NULL,
	"color" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "staff_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activity_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_duration_min" integer DEFAULT 60 NOT NULL,
	"buffer_min" integer DEFAULT 30 NOT NULL,
	"color" text NOT NULL,
	"default_space_id" uuid,
	"price" numeric(10, 2),
	"is_active" boolean DEFAULT true,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "activity_types_name_key" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "activity_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activity_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_type_id" integer NOT NULL,
	"staff_member_id" integer NOT NULL,
	"space_id" uuid NOT NULL,
	"app_user_id" uuid,
	"client_name" text,
	"start_datetime" timestamp with time zone NOT NULL,
	"end_datetime" timestamp with time zone NOT NULL,
	"buffer_end" timestamp with time zone NOT NULL,
	"price" numeric(10, 2),
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "activity_bookings_status_check" CHECK (status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text]))
);
--> statement-breakpoint
ALTER TABLE "activity_bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb,
	"restrictions" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"color" text DEFAULT '#d4883a',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "membership_plans_billing_cycle_check" CHECK (billing_cycle = ANY (ARRAY['monthly'::text, 'annual'::text, 'one_time'::text]))
);
--> statement-breakpoint
ALTER TABLE "membership_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "member_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_user_id" uuid,
	"plan_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"member_name" text NOT NULL,
	"member_email" text,
	"member_phone" text,
	"start_date" date DEFAULT CURRENT_DATE NOT NULL,
	"end_date" date,
	"next_billing_date" date,
	"payment_method" text,
	"amount_paid" numeric(10, 2) DEFAULT '0',
	"total_visits" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "member_memberships_status_check" CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'expired'::text, 'cancelled'::text, 'past_due'::text, 'trial'::text]))
);
--> statement-breakpoint
ALTER TABLE "member_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_lead_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "crm_lead_sources_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "crm_lead_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_line" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer NOT NULL,
	"color" text DEFAULT '#6B7280',
	"is_terminal" boolean DEFAULT false,
	"auto_advance_on" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "crm_pipeline_stages_business_line_slug_key" UNIQUE("business_line","slug")
);
--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "within_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"note_date" date,
	"note_type" text DEFAULT 'soap',
	"provider" text,
	"subjective" text,
	"objective" text,
	"assessment" text,
	"plan" text,
	"status" text DEFAULT 'draft',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"scribe_transcript" text,
	"scribe_extracts" jsonb,
	"note_format" text DEFAULT 'SOAP'
);
--> statement-breakpoint
ALTER TABLE "within_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "within_patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"dob" date,
	"sex" text,
	"gender_identity" text,
	"pronouns" text,
	"email" text,
	"phone" text,
	"address" text,
	"emergency_name" text,
	"emergency_relationship" text,
	"emergency_phone" text,
	"primary_diagnosis" text,
	"referring_provider" text,
	"current_medications" text,
	"allergies" text,
	"medical_history" text,
	"contraindications" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'active',
	"is_archived" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "within_patients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "within_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"session_date" date,
	"session_number" integer,
	"provider" text,
	"route" text,
	"drug" text DEFAULT 'ketamine',
	"weight_kg" numeric,
	"dose_mg" numeric,
	"dose_mg_kg" numeric,
	"duration_min" integer,
	"lot_number" text,
	"lot_expiration" date,
	"pre_vitals" jsonb DEFAULT '{}'::jsonb,
	"post_vitals" jsonb DEFAULT '{}'::jsonb,
	"intra_vitals" jsonb DEFAULT '[]'::jsonb,
	"last_meal_time" time,
	"meds_today" text,
	"pre_screening_notes" text,
	"go_decision" boolean DEFAULT false,
	"side_effects" jsonb DEFAULT '{}'::jsonb,
	"adjunct_meds" text,
	"session_notes" text,
	"discharge_criteria" jsonb DEFAULT '{}'::jsonb,
	"discharge_time" time,
	"discharge_notes" text,
	"status" text DEFAULT 'completed',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "within_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "within_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"assessment_date" date,
	"measure" text NOT NULL,
	"score" integer,
	"item_scores" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "within_assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "within_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"appt_date" date,
	"appt_time" time,
	"appt_type" text,
	"provider" text,
	"room" text,
	"notes" text,
	"status" text DEFAULT 'scheduled',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "within_appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "within_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"document_type" text,
	"sent_date" date,
	"signed_date" date,
	"status" text DEFAULT 'draft',
	"document_url" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "within_consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "within_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_date" date,
	"type" text NOT NULL,
	"lot_number" text,
	"quantity" numeric,
	"witness" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "within_inventory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "within_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"invoice_number" text,
	"invoice_date" date,
	"amount" numeric DEFAULT '0',
	"status" text DEFAULT 'pending',
	"line_items" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "within_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stripe_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_payment_intent_id" text,
	"payment_type" text DEFAULT 'one_time' NOT NULL,
	"reference_type" text DEFAULT 'crm_invoice' NOT NULL,
	"reference_id" text NOT NULL,
	"amount" numeric NOT NULL,
	"original_amount" numeric,
	"fee_amount" numeric DEFAULT '0',
	"status" text DEFAULT 'pending',
	"person_id" text,
	"person_name" text,
	"buyer_email" text,
	"ledger_id" uuid,
	"error_message" text,
	"is_test" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "stripe_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_line" text NOT NULL,
	"lead_id" uuid,
	"invoice_number" text NOT NULL,
	"invoice_date" date DEFAULT CURRENT_DATE,
	"due_date" date,
	"subtotal" numeric DEFAULT '0' NOT NULL,
	"discount_amount" numeric DEFAULT '0',
	"discount_label" text,
	"tax_amount" numeric DEFAULT '0',
	"total" numeric DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft',
	"stripe_payment_link_id" text,
	"stripe_payment_link_url" text,
	"stripe_payment_intent_id" text,
	"paid_at" timestamp with time zone,
	"paid_amount" numeric,
	"client_name" text,
	"client_email" text,
	"client_phone" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "crm_invoices_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'viewed'::text, 'paid'::text, 'void'::text]))
);
--> statement-breakpoint
ALTER TABLE "crm_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"service_package_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1,
	"unit_price" numeric NOT NULL,
	"total" numeric NOT NULL,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "crm_invoice_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"activity_type" text NOT NULL,
	"description" text,
	"old_stage_id" uuid,
	"new_stage_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "crm_activities_activity_type_check" CHECK (activity_type = ANY (ARRAY['note'::text, 'call'::text, 'email'::text, 'stage_change'::text, 'sms'::text, 'meeting'::text, 'system'::text, 'payment'::text]))
);
--> statement-breakpoint
ALTER TABLE "crm_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_service_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_line" text DEFAULT 'within' NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"price_regular" numeric NOT NULL,
	"price_promo" numeric,
	"description" text,
	"includes" jsonb,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"category" text,
	CONSTRAINT "crm_service_packages_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "crm_service_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_proposal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1,
	"unit_price" numeric NOT NULL,
	"total" numeric NOT NULL,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "crm_proposal_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_venue_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit_price" numeric NOT NULL,
	"unit" text DEFAULT 'flat' NOT NULL,
	"minimum_qty" integer DEFAULT 1,
	"capacity" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "crm_venue_catalog" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_ad_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"campaign_id" text,
	"campaign_name" text,
	"date" date NOT NULL,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"spend" numeric DEFAULT '0' NOT NULL,
	"conversions" integer DEFAULT 0,
	"cost_per_click" numeric,
	"business_line" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "crm_ad_spend_platform_campaign_id_date_key" UNIQUE("platform","campaign_id","date")
);
--> statement-breakpoint
ALTER TABLE "crm_ad_spend" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"proposal_number" text NOT NULL,
	"title" text NOT NULL,
	"event_date" date,
	"event_type" text,
	"guest_count" integer,
	"setup_time" text,
	"event_start" text,
	"event_end" text,
	"teardown_time" text,
	"subtotal" numeric DEFAULT '0',
	"discount_amount" numeric DEFAULT '0',
	"tax_amount" numeric DEFAULT '0',
	"total" numeric DEFAULT '0',
	"status" text DEFAULT 'draft',
	"valid_until" date,
	"notes" text,
	"terms" text,
	"invoice_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"payment_link_id" text,
	"payment_link_url" text,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"paid_at" timestamp with time zone,
	"paid_amount_cents" integer,
	"sent_at" timestamp with time zone,
	"sent_to_email" text,
	"payment_link_card_id" text,
	"payment_link_card_url" text,
	"signwell_document_id" text,
	"contract_signed_at" timestamp with time zone,
	"contract_signed_by_name" text,
	"contract_signed_by_email" text,
	"deposit_percent" integer DEFAULT 50,
	"balance_reminder_sent_at" timestamp with time zone,
	CONSTRAINT "crm_proposals_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'paid'::text]))
);
--> statement-breakpoint
ALTER TABLE "crm_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_number_sequences" (
	"prefix" text PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_number_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scheduling_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid,
	"lead_id" uuid,
	"booker_name" text NOT NULL,
	"booker_email" text NOT NULL,
	"booker_phone" text,
	"start_datetime" timestamp with time zone NOT NULL,
	"end_datetime" timestamp with time zone NOT NULL,
	"google_event_id" text,
	"status" text DEFAULT 'confirmed',
	"cancel_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"event_type_id" uuid,
	"booking_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"rescheduled_from" uuid,
	"cancelled_at" timestamp with time zone,
	"booker_timezone" text,
	"reminder_24h_sent_at" timestamp with time zone,
	"reminder_1h_sent_at" timestamp with time zone,
	"service_id" uuid,
	"space_id" uuid,
	"package_session_id" uuid,
	"staff_user_id" uuid,
	"created_by_admin_id" uuid,
	"facilitator_id" uuid,
	CONSTRAINT "scheduling_bookings_assignee_chk" CHECK ((cancelled_at IS NOT NULL) OR (profile_id IS NOT NULL) OR (staff_user_id IS NOT NULL) OR (facilitator_id IS NOT NULL)),
	CONSTRAINT "scheduling_bookings_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'no_show'::text]))
);
--> statement-breakpoint
ALTER TABLE "scheduling_bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scheduling_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_user_id" uuid NOT NULL,
	"booking_slug" text NOT NULL,
	"google_calendar_id" text DEFAULT 'primary',
	"google_refresh_token" text,
	"google_access_token" text,
	"token_expires_at" timestamp with time zone,
	"is_bookable" boolean DEFAULT false,
	"meeting_duration" integer DEFAULT 30,
	"buffer_minutes" integer DEFAULT 15,
	"available_hours" jsonb DEFAULT '{"fri":{"end":"17:00","start":"09:00"},"mon":{"end":"17:00","start":"09:00"},"thu":{"end":"17:00","start":"09:00"},"tue":{"end":"17:00","start":"09:00"},"wed":{"end":"17:00","start":"09:00"}}'::jsonb,
	"advance_days" integer DEFAULT 30,
	"meeting_title" text DEFAULT 'Free Consultation — Within Center',
	"meeting_description" text DEFAULT 'Free phone consultation to discuss your goals and treatment options.',
	"timezone" text DEFAULT 'America/Chicago',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "scheduling_profiles_booking_slug_key" UNIQUE("booking_slug")
);
--> statement-breakpoint
ALTER TABLE "scheduling_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category" text,
	"description" text,
	"sort_order" integer DEFAULT 100,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_titles_name_key" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "job_titles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scheduling_event_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"advance_days" integer DEFAULT 30 NOT NULL,
	"min_notice_minutes" integer DEFAULT 60 NOT NULL,
	"location_type" text DEFAULT 'video' NOT NULL,
	"location_detail" text,
	"available_hours" jsonb,
	"color" text,
	"notify_sms_on_booking" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_event_types_profile_id_slug_key" UNIQUE("profile_id","slug")
);
--> statement-breakpoint
ALTER TABLE "scheduling_event_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "beds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"label" text NOT NULL,
	"bed_type" text NOT NULL,
	"max_guests" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nightly_rate_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "beds_space_id_label_key" UNIQUE("space_id","label"),
	CONSTRAINT "beds_bed_type_check" CHECK (bed_type = ANY (ARRAY['king'::text, 'queen'::text, 'double'::text, 'twin'::text, 'bunk_top'::text, 'bunk_bottom'::text])),
	CONSTRAINT "beds_max_guests_check" CHECK (max_guests >= 1),
	CONSTRAINT "beds_nightly_rate_cents_check" CHECK (nightly_rate_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "client_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"name" text NOT NULL,
	"occupancy_rate" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_packages_occupancy_rate_check" CHECK (occupancy_rate = ANY (ARRAY['private'::text, 'shared'::text])),
	CONSTRAINT "client_packages_price_cents_check" CHECK (price_cents >= 0),
	CONSTRAINT "client_packages_status_check" CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text]))
);
--> statement-breakpoint
CREATE TABLE "admissions_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"model" text,
	"file_name" text,
	"file_size_bytes" bigint,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "admissions_analyses_status_check" CHECK (status = ANY (ARRAY['processing'::text, 'done'::text, 'error'::text]))
);
--> statement-breakpoint
CREATE TABLE "email_type_approval_config" (
	"email_type" text PRIMARY KEY NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "email_type_approval_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_package_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"status" text DEFAULT 'unscheduled' NOT NULL,
	"booking_id" uuid,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_package_sessions_status_check" CHECK (status = ANY (ARRAY['unscheduled'::text, 'scheduled'::text, 'completed'::text, 'cancelled'::text]))
);
--> statement-breakpoint
CREATE TABLE "client_stays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"bed_id" uuid,
	"package_id" uuid,
	"check_in_at" timestamp with time zone NOT NULL,
	"check_out_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"google_event_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_stays_check" CHECK (check_out_at > check_in_at),
	CONSTRAINT "client_stays_status_check" CHECK (status = ANY (ARRAY['upcoming'::text, 'active'::text, 'completed'::text, 'cancelled'::text]))
);
--> statement-breakpoint
CREATE TABLE "facilitators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facilitators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"default_price_cents" integer DEFAULT 0 NOT NULL,
	"requires_upfront_payment" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_group_class" boolean DEFAULT false NOT NULL,
	"max_capacity" integer,
	CONSTRAINT "services_slug_key" UNIQUE("slug"),
	CONSTRAINT "services_default_price_cents_check" CHECK (default_price_cents >= 0),
	CONSTRAINT "services_duration_minutes_check" CHECK (duration_minutes > 0),
	CONSTRAINT "services_max_capacity_check" CHECK ((max_capacity IS NULL) OR (max_capacity > 0))
);
--> statement-breakpoint
CREATE TABLE "scheduling_booking_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"package_session_id" uuid,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"attended_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_booking_attendees_booking_id_lead_id_key" UNIQUE("booking_id","lead_id"),
	CONSTRAINT "scheduling_booking_attendees_status_check" CHECK (status = ANY (ARRAY['confirmed'::text, 'cancelled'::text, 'attended'::text, 'no_show'::text]))
);
--> statement-breakpoint
ALTER TABLE "scheduling_booking_attendees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_integration_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"author_app_user_id" uuid,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_integration_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_chart_state" (
	"id" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"chart_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_email" text,
	CONSTRAINT "org_chart_state_id_check" CHECK (id = 'main'::text)
);
--> statement-breakpoint
ALTER TABLE "org_chart_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_space_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"setup_minutes" integer DEFAULT 0 NOT NULL,
	"breakdown_minutes" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_space_reservations_breakdown_minutes_check" CHECK (breakdown_minutes >= 0),
	CONSTRAINT "event_space_reservations_check" CHECK (end_at > start_at),
	CONSTRAINT "event_space_reservations_setup_minutes_check" CHECK (setup_minutes >= 0)
);
--> statement-breakpoint
ALTER TABLE "event_space_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "within_retreat_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"package_id" uuid,
	"signwell_document_id" text,
	"signing_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"merge_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"signed_by_name" text,
	"signed_by_email" text,
	"signed_pdf_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "within_retreat_agreements_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'signed'::text, 'declined'::text, 'expired'::text, 'voided'::text]))
);
--> statement-breakpoint
ALTER TABLE "within_retreat_agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_line" text NOT NULL,
	"stage_id" uuid,
	"source_id" uuid,
	"status" text DEFAULT 'open',
	"lost_reason" text,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text,
	"phone" text,
	"city" text,
	"state" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"google_ads_click_id" text,
	"meta_ads_click_id" text,
	"patient_id" uuid,
	"contact_submission_id" uuid,
	"estimated_value" numeric DEFAULT '0',
	"actual_revenue" numeric DEFAULT '0',
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"contacted_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"space_id" uuid,
	"event_date" date,
	"event_start_time" text,
	"event_end_time" text,
	"event_type" text,
	"guest_count" integer,
	"booking_id" uuid,
	"notes" text,
	"preferred_name" text,
	"pronouns" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"emergency_contact_relationship" text,
	"dietary_preferences" text,
	"dietary_dislikes" text,
	"room_preferences" text,
	"arrival_method" text,
	"arrival_details" text,
	"arrival_pickup_needed" boolean DEFAULT false,
	"departure_details" text,
	"departure_pickup_needed" boolean DEFAULT false,
	"waiver_signed" boolean DEFAULT false,
	"intake_completed" boolean DEFAULT false,
	"vendor_list" text,
	"day_of_timeline" text,
	"internal_staff_notes" text,
	"deposit_amount" numeric,
	"deposit_due_at" date,
	"deposit_paid_at" timestamp with time zone,
	"balance_amount" numeric,
	"balance_due_at" date,
	"balance_paid_at" timestamp with time zone,
	"additional_space_ids" uuid[],
	"event_end_date" date,
	CONSTRAINT "crm_leads_status_check" CHECK (status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text]))
);
--> statement-breakpoint
ALTER TABLE "crm_leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "house_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "house_meals_unique" UNIQUE("meal_date","start_time","name")
);
--> statement-breakpoint
ALTER TABLE "house_meals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff_activity_types" (
	"staff_member_id" integer NOT NULL,
	"activity_type_id" integer NOT NULL,
	CONSTRAINT "staff_activity_types_pkey" PRIMARY KEY("staff_member_id","activity_type_id")
);
--> statement-breakpoint
ALTER TABLE "staff_activity_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role" text NOT NULL,
	"permission_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pkey" PRIMARY KEY("role","permission_key")
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_title_permissions" (
	"job_title_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_title_permissions_pkey" PRIMARY KEY("job_title_id","permission_key")
);
--> statement-breakpoint
ALTER TABLE "job_title_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "facilitator_services" (
	"facilitator_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facilitator_services_pkey" PRIMARY KEY("facilitator_id","service_id")
);
--> statement-breakpoint
ALTER TABLE "facilitator_services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"app_user_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"granted" boolean NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permissions_pkey" PRIMARY KEY("app_user_id","permission_key")
);
--> statement-breakpoint
ALTER TABLE "user_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_service_package_items" (
	"package_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_service_package_items_pkey" PRIMARY KEY("package_id","service_id"),
	CONSTRAINT "crm_service_package_items_quantity_check" CHECK (quantity > 0)
);
--> statement-breakpoint
ALTER TABLE "crm_service_package_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wc_bookings" ADD CONSTRAINT "wc_bookings_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."wc_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wc_provider_schedules" ADD CONSTRAINT "wc_provider_schedules_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."wc_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_job_title_fk" FOREIGN KEY ("job_title_id") REFERENCES "public"."job_titles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."todo_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_rooms" ADD CONSTRAINT "booking_rooms_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_rooms" ADD CONSTRAINT "booking_rooms_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_spaces" ADD CONSTRAINT "booking_spaces_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_spaces" ADD CONSTRAINT "booking_spaces_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_types" ADD CONSTRAINT "activity_types_default_space_id_fkey" FOREIGN KEY ("default_space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_bookings" ADD CONSTRAINT "activity_bookings_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_bookings" ADD CONSTRAINT "activity_bookings_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_bookings" ADD CONSTRAINT "activity_bookings_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_bookings" ADD CONSTRAINT "activity_bookings_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_memberships" ADD CONSTRAINT "member_memberships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "within_notes" ADD CONSTRAINT "within_notes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."within_patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "within_sessions" ADD CONSTRAINT "within_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."within_patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "within_assessments" ADD CONSTRAINT "within_assessments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."within_patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "within_appointments" ADD CONSTRAINT "within_appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."within_patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "within_consents" ADD CONSTRAINT "within_consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."within_patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "within_invoices" ADD CONSTRAINT "within_invoices_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."within_patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD CONSTRAINT "crm_invoices_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoice_line_items" ADD CONSTRAINT "crm_invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."crm_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoice_line_items" ADD CONSTRAINT "crm_invoice_line_items_service_package_id_fkey" FOREIGN KEY ("service_package_id") REFERENCES "public"."crm_service_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_new_stage_id_fkey" FOREIGN KEY ("new_stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_old_stage_id_fkey" FOREIGN KEY ("old_stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposal_items" ADD CONSTRAINT "crm_proposal_items_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."crm_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_bookings" ADD CONSTRAINT "scheduling_bookings_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_bookings" ADD CONSTRAINT "scheduling_bookings_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "public"."scheduling_event_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_bookings" ADD CONSTRAINT "scheduling_bookings_facilitator_id_fkey" FOREIGN KEY ("facilitator_id") REFERENCES "public"."facilitators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_bookings" ADD CONSTRAINT "scheduling_bookings_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_bookings" ADD CONSTRAINT "scheduling_bookings_package_session_id_fkey" FOREIGN KEY ("package_session_id") REFERENCES "public"."client_package_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_bookings" ADD CONSTRAINT "scheduling_bookings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."scheduling_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_bookings" ADD CONSTRAINT "scheduling_bookings_rescheduled_from_fkey" FOREIGN KEY ("rescheduled_from") REFERENCES "public"."scheduling_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_bookings" ADD CONSTRAINT "scheduling_bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_bookings" ADD CONSTRAINT "scheduling_bookings_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_bookings" ADD CONSTRAINT "scheduling_bookings_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_profiles" ADD CONSTRAINT "scheduling_profiles_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_titles" ADD CONSTRAINT "job_titles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_event_types" ADD CONSTRAINT "scheduling_event_types_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."scheduling_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beds" ADD CONSTRAINT "beds_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_package_sessions" ADD CONSTRAINT "client_package_sessions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."scheduling_bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_package_sessions" ADD CONSTRAINT "client_package_sessions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."client_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_package_sessions" ADD CONSTRAINT "client_package_sessions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_stays" ADD CONSTRAINT "client_stays_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "public"."beds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_stays" ADD CONSTRAINT "client_stays_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_stays" ADD CONSTRAINT "client_stays_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."client_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_booking_attendees" ADD CONSTRAINT "scheduling_booking_attendees_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."scheduling_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_booking_attendees" ADD CONSTRAINT "scheduling_booking_attendees_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_booking_attendees" ADD CONSTRAINT "scheduling_booking_attendees_package_session_id_fkey" FOREIGN KEY ("package_session_id") REFERENCES "public"."client_package_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_integration_notes" ADD CONSTRAINT "client_integration_notes_author_app_user_id_fkey" FOREIGN KEY ("author_app_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_integration_notes" ADD CONSTRAINT "client_integration_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_space_reservations" ADD CONSTRAINT "event_space_reservations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_space_reservations" ADD CONSTRAINT "event_space_reservations_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "within_retreat_agreements" ADD CONSTRAINT "within_retreat_agreements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "within_retreat_agreements" ADD CONSTRAINT "within_retreat_agreements_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "within_retreat_agreements" ADD CONSTRAINT "within_retreat_agreements_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."client_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."crm_lead_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_activity_types" ADD CONSTRAINT "staff_activity_types_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_activity_types" ADD CONSTRAINT "staff_activity_types_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_title_permissions" ADD CONSTRAINT "job_title_permissions_job_title_id_fkey" FOREIGN KEY ("job_title_id") REFERENCES "public"."job_titles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_title_permissions" ADD CONSTRAINT "job_title_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilitator_services" ADD CONSTRAINT "facilitator_services_facilitator_id_fkey" FOREIGN KEY ("facilitator_id") REFERENCES "public"."facilitators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilitator_services" ADD CONSTRAINT "facilitator_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_service_package_items" ADD CONSTRAINT "crm_service_package_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."crm_service_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_service_package_items" ADD CONSTRAINT "crm_service_package_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_within_audit_log_action" ON "within_audit_log" USING btree ("action" timestamptz_ops,"timestamp" text_ops);--> statement-breakpoint
CREATE INDEX "idx_within_audit_log_user_time" ON "within_audit_log" USING btree ("user_email" timestamptz_ops,"timestamp" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "image_library_created_at_idx" ON "image_library" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "image_library_tags_idx" ON "image_library" USING gin ("tags" array_ops);--> statement-breakpoint
CREATE INDEX "idx_wc_posts_published" ON "wc_posts" USING btree ("is_published" bool_ops,"published_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_wc_posts_slug" ON "wc_posts" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "idx_wc_bookings_date" ON "wc_bookings" USING btree ("booking_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_wc_bookings_email" ON "wc_bookings" USING btree ("client_email" text_ops);--> statement-breakpoint
CREATE INDEX "idx_wc_bookings_status" ON "wc_bookings" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_wc_contact_status" ON "wc_contact_submissions" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_app_users_is_archived" ON "app_users" USING btree ("is_archived" bool_ops) WHERE (is_archived = false);--> statement-breakpoint
CREATE INDEX "idx_app_users_job_title_id" ON "app_users" USING btree ("job_title_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_invitations_email_sent_at" ON "user_invitations" USING btree ("email_sent_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_rooms_dates" ON "booking_rooms" USING btree ("check_in" date_ops,"check_out" date_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_rooms_space" ON "booking_rooms" USING btree ("space_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_spaces_dates" ON "booking_spaces" USING btree ("start_datetime" timestamptz_ops,"end_datetime" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_booking_spaces_space" ON "booking_spaces" USING btree ("space_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_activity_bookings_dates" ON "activity_bookings" USING btree ("start_datetime" timestamptz_ops,"end_datetime" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_activity_bookings_space" ON "activity_bookings" USING btree ("space_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_activity_bookings_staff" ON "activity_bookings" USING btree ("staff_member_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_invoices_business_line" ON "crm_invoices" USING btree ("business_line" text_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_invoices_lead_id" ON "crm_invoices" USING btree ("lead_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_invoices_status" ON "crm_invoices" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_invoice_items_invoice" ON "crm_invoice_line_items" USING btree ("invoice_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_activities_lead_id" ON "crm_activities" USING btree ("lead_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "crm_service_packages_category_idx" ON "crm_service_packages" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_proposal_items_proposal" ON "crm_proposal_items" USING btree ("proposal_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "crm_proposals_checkout_session_idx" ON "crm_proposals" USING btree ("stripe_checkout_session_id" text_ops);--> statement-breakpoint
CREATE INDEX "crm_proposals_payment_link_idx" ON "crm_proposals" USING btree ("payment_link_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_proposals_lead_id" ON "crm_proposals" USING btree ("lead_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_proposals_signwell_document_id" ON "crm_proposals" USING btree ("signwell_document_id" text_ops) WHERE (signwell_document_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_crm_proposals_status" ON "crm_proposals" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_sched_bookings_service" ON "scheduling_bookings" USING btree ("service_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_sched_bookings_space" ON "scheduling_bookings" USING btree ("space_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_sched_bookings_staff" ON "scheduling_bookings" USING btree ("staff_user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_scheduling_bookings_profile" ON "scheduling_bookings" USING btree ("profile_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_scheduling_bookings_start" ON "scheduling_bookings" USING btree ("start_datetime" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "scheduling_bookings_facilitator_idx" ON "scheduling_bookings" USING btree ("facilitator_id" uuid_ops) WHERE (facilitator_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_bookings_facilitator_slot_unique" ON "scheduling_bookings" USING btree ("facilitator_id" timestamptz_ops,"start_datetime" uuid_ops) WHERE ((cancelled_at IS NULL) AND (facilitator_id IS NOT NULL));--> statement-breakpoint
CREATE INDEX "scheduling_bookings_lead_idx" ON "scheduling_bookings" USING btree ("lead_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_bookings_slot_unique" ON "scheduling_bookings" USING btree ("profile_id" uuid_ops,"event_type_id" timestamptz_ops,"start_datetime" timestamptz_ops) WHERE (cancelled_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_bookings_staff_slot_unique" ON "scheduling_bookings" USING btree ("staff_user_id" timestamptz_ops,"start_datetime" uuid_ops) WHERE ((cancelled_at IS NULL) AND (staff_user_id IS NOT NULL));--> statement-breakpoint
CREATE INDEX "scheduling_bookings_token_idx" ON "scheduling_bookings" USING btree ("booking_token" uuid_ops);--> statement-breakpoint
CREATE INDEX "scheduling_event_types_profile_idx" ON "scheduling_event_types" USING btree ("profile_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_beds_space" ON "beds" USING btree ("space_id" uuid_ops) WHERE (is_archived = false);--> statement-breakpoint
CREATE INDEX "idx_client_packages_lead" ON "client_packages" USING btree ("lead_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_client_packages_status" ON "client_packages" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_admissions_analyses_created_at" ON "admissions_analyses" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_pkg_sessions_booking" ON "client_package_sessions" USING btree ("booking_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_pkg_sessions_package" ON "client_package_sessions" USING btree ("package_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_pkg_sessions_status" ON "client_package_sessions" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_client_stays_bed" ON "client_stays" USING btree ("bed_id" timestamptz_ops,"check_in_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_client_stays_lead" ON "client_stays" USING btree ("lead_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_client_stays_window" ON "client_stays" USING btree ("status" text_ops,"check_in_at" text_ops,"check_out_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_services_active_sort" ON "services" USING btree ("is_active" int4_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_attendees_booking" ON "scheduling_booking_attendees" USING btree ("booking_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_attendees_lead" ON "scheduling_booking_attendees" USING btree ("lead_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_attendees_session" ON "scheduling_booking_attendees" USING btree ("package_session_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "client_integration_notes_lead_idx" ON "client_integration_notes" USING btree ("lead_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_esr_lead" ON "event_space_reservations" USING btree ("lead_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_esr_space" ON "event_space_reservations" USING btree ("space_id" timestamptz_ops,"start_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_esr_window" ON "event_space_reservations" USING btree ("start_at" timestamptz_ops,"end_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "within_retreat_agreements_lead_id_idx" ON "within_retreat_agreements" USING btree ("lead_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "within_retreat_agreements_package_id_idx" ON "within_retreat_agreements" USING btree ("package_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "within_retreat_agreements_signwell_doc_id_idx" ON "within_retreat_agreements" USING btree ("signwell_document_id" text_ops) WHERE (signwell_document_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_crm_leads_business_line" ON "crm_leads" USING btree ("business_line" text_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_leads_created_at" ON "crm_leads" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_leads_source_id" ON "crm_leads" USING btree ("source_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_leads_stage_id" ON "crm_leads" USING btree ("stage_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_crm_leads_status" ON "crm_leads" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "house_meals_date_idx" ON "house_meals" USING btree ("meal_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_role_permissions_role" ON "role_permissions" USING btree ("role" text_ops);--> statement-breakpoint
CREATE INDEX "idx_job_title_permissions_title" ON "job_title_permissions" USING btree ("job_title_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "facilitator_services_service_idx" ON "facilitator_services" USING btree ("service_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_permissions_user" ON "user_permissions" USING btree ("app_user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "crm_service_package_items_service_idx" ON "crm_service_package_items" USING btree ("service_id" uuid_ops);--> statement-breakpoint
CREATE POLICY "Anon can read active staff emails" ON "within_staff" AS PERMISSIVE FOR SELECT TO "anon" USING ((status = 'active'::text));--> statement-breakpoint
CREATE POLICY "within_staff_authorized" ON "within_staff" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "Anon can insert audit logs" ON "within_audit_log" AS PERMISSIVE FOR INSERT TO "anon" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can insert audit logs" ON "within_audit_log" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can read audit logs" ON "within_audit_log" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "image_library_delete" ON "image_library" AS PERMISSIVE FOR DELETE TO public USING (is_within_authorized());--> statement-breakpoint
CREATE POLICY "image_library_insert" ON "image_library" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "image_library_read" ON "image_library" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "image_library_update" ON "image_library" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Authenticated manage services" ON "wc_services" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Public can view active services" ON "wc_services" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated manage team" ON "wc_team_members" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Public can view active team members" ON "wc_team_members" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated manage posts" ON "wc_posts" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Public can view published posts" ON "wc_posts" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated manage bookings" ON "wc_bookings" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Public can create bookings" ON "wc_bookings" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated manage contacts" ON "wc_contact_submissions" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Public can submit contact forms" ON "wc_contact_submissions" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated manage newsletter" ON "wc_newsletter_subscribers" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Public can subscribe to newsletter" ON "wc_newsletter_subscribers" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated manage providers" ON "wc_providers" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Public can view active providers" ON "wc_providers" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Authenticated manage schedules" ON "wc_provider_schedules" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "Public can view active schedules" ON "wc_provider_schedules" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Users can insert own record" ON "app_users" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = auth_user_id));--> statement-breakpoint
CREATE POLICY "Users can read own record" ON "app_users" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Users can update own record" ON "app_users" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins can insert invitations" ON "user_invitations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((invited_by IN ( SELECT app_users.id
   FROM app_users
  WHERE ((app_users.auth_user_id = auth.uid()) AND (app_users.role = ANY (ARRAY['admin'::text, 'oracle'::text]))))));--> statement-breakpoint
CREATE POLICY "Authenticated can read invitations" ON "user_invitations" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated can update invitations" ON "user_invitations" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Anon can delete todo_categories" ON "todo_categories" AS PERMISSIVE FOR DELETE TO "anon" USING (true);--> statement-breakpoint
CREATE POLICY "Anon can insert todo_categories" ON "todo_categories" AS PERMISSIVE FOR INSERT TO "anon";--> statement-breakpoint
CREATE POLICY "Anon can read todo_categories" ON "todo_categories" AS PERMISSIVE FOR SELECT TO "anon";--> statement-breakpoint
CREATE POLICY "Anon can update todo_categories" ON "todo_categories" AS PERMISSIVE FOR UPDATE TO "anon";--> statement-breakpoint
CREATE POLICY "Authenticated users can delete todo_categories" ON "todo_categories" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can insert todo_categories" ON "todo_categories" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can read todo_categories" ON "todo_categories" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can update todo_categories" ON "todo_categories" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Anon can delete todo_items" ON "todo_items" AS PERMISSIVE FOR DELETE TO "anon" USING (true);--> statement-breakpoint
CREATE POLICY "Anon can insert todo_items" ON "todo_items" AS PERMISSIVE FOR INSERT TO "anon";--> statement-breakpoint
CREATE POLICY "Anon can read todo_items" ON "todo_items" AS PERMISSIVE FOR SELECT TO "anon";--> statement-breakpoint
CREATE POLICY "Anon can update todo_items" ON "todo_items" AS PERMISSIVE FOR UPDATE TO "anon";--> statement-breakpoint
CREATE POLICY "Authenticated users can delete todo_items" ON "todo_items" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can insert todo_items" ON "todo_items" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can read todo_items" ON "todo_items" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can update todo_items" ON "todo_items" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "spaces_auth_delete" ON "spaces" AS PERMISSIVE FOR DELETE TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "spaces_auth_insert" ON "spaces" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "spaces_auth_read" ON "spaces" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "spaces_auth_update" ON "spaces" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "spaces_public_read" ON "spaces" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Service role full access" ON "investor_access" AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text));--> statement-breakpoint
CREATE POLICY "Users can read own access" ON "investor_access" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Anon can read property_config" ON "property_config" AS PERMISSIVE FOR SELECT TO "anon" USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can read property_config" ON "property_config" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_delete_booking_rooms" ON "booking_rooms" AS PERMISSIVE FOR DELETE TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "auth_insert_booking_rooms" ON "booking_rooms" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_read_booking_rooms" ON "booking_rooms" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_update_booking_rooms" ON "booking_rooms" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_delete_booking_spaces" ON "booking_spaces" AS PERMISSIVE FOR DELETE TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "auth_insert_booking_spaces" ON "booking_spaces" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_read_booking_spaces" ON "booking_spaces" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_update_booking_spaces" ON "booking_spaces" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_insert_staff_members" ON "staff_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "auth_read_staff_members" ON "staff_members" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_update_staff_members" ON "staff_members" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_insert_activity_types" ON "activity_types" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "auth_read_activity_types" ON "activity_types" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_update_activity_types" ON "activity_types" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_delete_activity_bookings" ON "activity_bookings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "auth_insert_activity_bookings" ON "activity_bookings" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_read_activity_bookings" ON "activity_bookings" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_update_activity_bookings" ON "activity_bookings" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated read membership_plans" ON "membership_plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated write membership_plans" ON "membership_plans" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated read member_memberships" ON "member_memberships" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated write member_memberships" ON "member_memberships" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can read CRM lookups" ON "crm_lead_sources" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Service role full access lead_sources" ON "crm_lead_sources" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Authenticated users can read CRM stages" ON "crm_pipeline_stages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Service role full access stages" ON "crm_pipeline_stages" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "within_notes_authorized" ON "within_notes" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_within_authorized()) WITH CHECK (is_within_authorized());--> statement-breakpoint
CREATE POLICY "within_patients_authorized" ON "within_patients" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_within_authorized()) WITH CHECK (is_within_authorized());--> statement-breakpoint
CREATE POLICY "within_sessions_authorized" ON "within_sessions" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_within_authorized()) WITH CHECK (is_within_authorized());--> statement-breakpoint
CREATE POLICY "within_assessments_authorized" ON "within_assessments" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_within_authorized()) WITH CHECK (is_within_authorized());--> statement-breakpoint
CREATE POLICY "within_appointments_authorized" ON "within_appointments" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_within_authorized()) WITH CHECK (is_within_authorized());--> statement-breakpoint
CREATE POLICY "within_consents_authorized" ON "within_consents" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_within_authorized()) WITH CHECK (is_within_authorized());--> statement-breakpoint
CREATE POLICY "within_inventory_authorized" ON "within_inventory" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_within_authorized()) WITH CHECK (is_within_authorized());--> statement-breakpoint
CREATE POLICY "within_invoices_authorized" ON "within_invoices" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_within_authorized()) WITH CHECK (is_within_authorized());--> statement-breakpoint
CREATE POLICY "Authenticated insert stripe_payments" ON "stripe_payments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Authenticated read stripe_payments" ON "stripe_payments" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access stripe_payments" ON "stripe_payments" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Authenticated users can delete invoices" ON "crm_invoices" AS PERMISSIVE FOR DELETE TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can insert invoices" ON "crm_invoices" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can read invoices" ON "crm_invoices" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can update invoices" ON "crm_invoices" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access invoices" ON "crm_invoices" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Authenticated users can delete invoice items" ON "crm_invoice_line_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can insert invoice items" ON "crm_invoice_line_items" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can read invoice items" ON "crm_invoice_line_items" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can update invoice items" ON "crm_invoice_line_items" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access invoice_items" ON "crm_invoice_line_items" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Authenticated users can insert activities" ON "crm_activities" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can read activities" ON "crm_activities" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access activities" ON "crm_activities" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Authenticated users can read CRM packages" ON "crm_service_packages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Service role full access packages" ON "crm_service_packages" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Anon read sent proposal items" ON "crm_proposal_items" AS PERMISSIVE FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM crm_proposals
  WHERE ((crm_proposals.id = crm_proposal_items.proposal_id) AND (crm_proposals.status = 'sent'::text)))));--> statement-breakpoint
CREATE POLICY "Auth delete proposal items" ON "crm_proposal_items" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Auth insert proposal items" ON "crm_proposal_items" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Auth read proposal items" ON "crm_proposal_items" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Auth update proposal items" ON "crm_proposal_items" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role proposal items" ON "crm_proposal_items" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Anon read venue catalog" ON "crm_venue_catalog" AS PERMISSIVE FOR SELECT TO "anon" USING (true);--> statement-breakpoint
CREATE POLICY "Auth manage venue catalog" ON "crm_venue_catalog" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "Auth read venue catalog" ON "crm_venue_catalog" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role venue catalog" ON "crm_venue_catalog" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Auth insert ad spend" ON "crm_ad_spend" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Auth read ad spend" ON "crm_ad_spend" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role ad spend" ON "crm_ad_spend" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Anon read sent proposals" ON "crm_proposals" AS PERMISSIVE FOR SELECT TO "anon" USING ((status = 'sent'::text));--> statement-breakpoint
CREATE POLICY "Auth delete proposals" ON "crm_proposals" AS PERMISSIVE FOR DELETE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Auth insert proposals" ON "crm_proposals" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Auth read proposals" ON "crm_proposals" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Auth update proposals" ON "crm_proposals" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role proposals" ON "crm_proposals" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Auth read sequences" ON "crm_number_sequences" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Service role full sequences" ON "crm_number_sequences" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Anon read own bookings" ON "scheduling_bookings" AS PERMISSIVE FOR SELECT TO "anon" USING (true);--> statement-breakpoint
CREATE POLICY "Auth read bookings" ON "scheduling_bookings" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Auth update bookings" ON "scheduling_bookings" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role bookings" ON "scheduling_bookings" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "Anon read bookable profiles" ON "scheduling_profiles" AS PERMISSIVE FOR SELECT TO "anon" USING ((is_bookable = true));--> statement-breakpoint
CREATE POLICY "Auth insert profiles" ON "scheduling_profiles" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Auth read profiles" ON "scheduling_profiles" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Auth update profiles" ON "scheduling_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role profiles" ON "scheduling_profiles" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "permissions_read" ON "permissions" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "permissions_write" ON "permissions" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "job_titles_read" ON "job_titles" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "job_titles_write" ON "job_titles" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "event_types_admin_all" ON "scheduling_event_types" AS PERMISSIVE FOR ALL TO public USING (((EXISTS ( SELECT 1
   FROM (app_users u
     JOIN user_permissions up ON ((up.app_user_id = u.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (up.permission_key = 'manage_scheduling'::text) AND (up.granted = true)))) OR (EXISTS ( SELECT 1
   FROM app_users u
  WHERE ((u.auth_user_id = auth.uid()) AND (u.role = ANY (ARRAY['admin'::text, 'oracle'::text])))))));--> statement-breakpoint
CREATE POLICY "event_types_owner_all" ON "scheduling_event_types" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "event_types_public_read" ON "scheduling_event_types" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "event_types_service_role" ON "scheduling_event_types" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "service role only" ON "email_type_approval_config" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can read facilitators" ON "facilitators" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can write facilitators" ON "facilitators" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "Auth read attendees" ON "scheduling_booking_attendees" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Auth update attendees" ON "scheduling_booking_attendees" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role attendees" ON "scheduling_booking_attendees" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "staff insert integration notes" ON "client_integration_notes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users
  WHERE ((app_users.auth_user_id = auth.uid()) AND (app_users.role = ANY (ARRAY['admin'::text, 'staff'::text, 'oracle'::text]))))));--> statement-breakpoint
CREATE POLICY "staff read integration notes" ON "client_integration_notes" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "staff update integration notes" ON "client_integration_notes" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "org_chart auth write" ON "org_chart_state" AS PERMISSIVE FOR ALL TO "authenticated" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "org_chart public read" ON "org_chart_state" AS PERMISSIVE FOR SELECT TO "anon", "authenticated";--> statement-breakpoint
CREATE POLICY "esr authenticated read" ON "event_space_reservations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "esr authenticated write" ON "event_space_reservations" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "within_retreat_agreements_admin_all" ON "within_retreat_agreements" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.auth_user_id = auth.uid()) AND (au.role = ANY (ARRAY['admin'::text, 'staff'::text, 'oracle'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM app_users au
  WHERE ((au.auth_user_id = auth.uid()) AND (au.role = ANY (ARRAY['admin'::text, 'staff'::text, 'oracle'::text]))))));--> statement-breakpoint
CREATE POLICY "Authenticated users can delete leads" ON "crm_leads" AS PERMISSIVE FOR DELETE TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can insert leads" ON "crm_leads" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can read leads" ON "crm_leads" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Authenticated users can update leads" ON "crm_leads" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Service role full access leads" ON "crm_leads" AS PERMISSIVE FOR ALL TO "service_role";--> statement-breakpoint
CREATE POLICY "house_meals_modify" ON "house_meals" AS PERMISSIVE FOR ALL TO public USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));--> statement-breakpoint
CREATE POLICY "house_meals_select" ON "house_meals" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "auth_delete_staff_activity_types" ON "staff_activity_types" AS PERMISSIVE FOR DELETE TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "auth_insert_staff_activity_types" ON "staff_activity_types" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "auth_read_staff_activity_types" ON "staff_activity_types" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "role_permissions_read" ON "role_permissions" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "role_permissions_write" ON "role_permissions" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "job_title_permissions_read" ON "job_title_permissions" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "job_title_permissions_write" ON "job_title_permissions" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Authenticated users can read facilitator_services" ON "facilitator_services" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can write facilitator_services" ON "facilitator_services" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "user_permissions_read" ON "user_permissions" AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));--> statement-breakpoint
CREATE POLICY "user_permissions_write" ON "user_permissions" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Authenticated users can read crm_service_package_items" ON "crm_service_package_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated users can write crm_service_package_items" ON "crm_service_package_items" AS PERMISSIVE FOR ALL TO "authenticated";
*/