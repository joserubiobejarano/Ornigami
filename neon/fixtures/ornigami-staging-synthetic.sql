-- Synthetic Ornigami Preview display fixture. Never apply to production.
-- Apply only after a separately approved, empty/schema-only target has been
-- created and its migration state and database identity have been verified.
-- No password hash, provider binding, queued delivery, active agent or schedule
-- is included. The user cannot authenticate with this seed alone.
BEGIN;

INSERT INTO public.users (id, email, name)
VALUES (
  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001',
  'preview.owner@ornigami.example.test',
  'Example Preview Owner'
);

INSERT INTO public.profiles (id, full_name, business_name, city, country, plan, plan_type, plan_status)
VALUES (
  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001',
  'Example Preview Owner',
  'Example Studio 001',
  'Example City',
  'ES',
  'free',
  'free',
  'free'
);

INSERT INTO public.businesses (id, owner_user_id, name, business_type, city, country, website, tone, language)
VALUES (
  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',
  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001',
  'Example Studio 001',
  'fictional studio',
  'Example City',
  'ES',
  'https://studio-001.example.test',
  'friendly',
  'en'
);

INSERT INTO public.business_members (business_id, user_id, role)
VALUES (
  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',
  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001',
  'owner'
);

INSERT INTO public.reviews (user_id, business_id, location_name, google_review_id, reviewer_name, star_rating, comment, language_code, status)
VALUES (
  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0001',
  '6f3a17d2-8ce1-4b51-9c6a-4d3c2b1a0002',
  'Example Studio 001',
  'synthetic-review-0001',
  'Example Reviewer 001',
  5,
  'This is fictional feedback for the private Preview display only.',
  'en',
  'new'
);

COMMIT;
