UPDATE public.profiles
SET plan = 'free'
WHERE plan IN ('starter', 'pro', 'agency');

UPDATE public.profiles
SET plan_type = 'free'
WHERE plan_type IN ('starter', 'pro', 'agency');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_plan_current_values_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_current_values_check
      CHECK (plan IS NULL OR plan IN ('free', 'replies', 'booster', 'complete'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_plan_type_current_values_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_type_current_values_check
      CHECK (plan_type IS NULL OR plan_type IN ('free', 'replies', 'booster', 'complete'));
  END IF;
END $$;
