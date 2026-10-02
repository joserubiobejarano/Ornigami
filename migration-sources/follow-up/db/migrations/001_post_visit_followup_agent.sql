CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_type text,
  city text,
  google_review_url text NOT NULL,
  rebooking_url text,
  tone text DEFAULT 'warm and friendly',
  language text DEFAULT 'en',
  email_from_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  customer_name text,
  customer_email text,
  customer_phone text,
  service_name text,
  visited_at timestamptz NOT NULL,
  source text DEFAULT 'manual',
  external_id text,
  followup_status text DEFAULT 'pending',
  followup_sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS followup_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid REFERENCES visits(id) ON DELETE CASCADE,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  channel text DEFAULT 'email',
  subject text,
  body text,
  provider text DEFAULT 'resend',
  provider_message_id text,
  status text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  source text,
  event_type text,
  external_id text,
  raw_payload jsonb,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visits_business_id ON visits(business_id);
CREATE INDEX IF NOT EXISTS idx_visits_visited_at ON visits(visited_at);
CREATE INDEX IF NOT EXISTS idx_visits_followup_status ON visits(followup_status);
CREATE INDEX IF NOT EXISTS idx_visits_followup_sent_at ON visits(followup_sent_at);
CREATE INDEX IF NOT EXISTS idx_followup_messages_visit_id ON followup_messages(visit_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_dedupe ON integration_events(business_id, source, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_integration_event_external
ON integration_events(business_id, source, external_id)
WHERE external_id IS NOT NULL;
