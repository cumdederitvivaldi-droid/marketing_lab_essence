CREATE TABLE IF NOT EXISTS public.disposal_guide_step_choices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  step TEXT NOT NULL CHECK (step IN ('category', 'weight', 'perceived_weight', 'splittable')),
  choice_id TEXT NOT NULL,
  label TEXT NOT NULL CHECK (length(label) > 0),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (step, choice_id)
);

CREATE TABLE IF NOT EXISTS public.disposal_guide_recommendation_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_id TEXT NOT NULL UNIQUE,
  priority INTEGER NOT NULL,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(condition) = 'object'),
  action TEXT NOT NULL CHECK (
    action IN (
      'VISIT_PICKUP',
      'LARGE_COVERING_BAG',
      'GENERAL_BAG_MULTIPLE',
      'GENERAL_BAG_SINGLE',
      'HEAVY_SPLIT_DECISION'
    )
  ),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.disposal_guide_result_copy (
  recommendation TEXT PRIMARY KEY CHECK (
    recommendation IN (
      'VISIT_PICKUP',
      'LARGE_COVERING_BAG',
      'GENERAL_BAG_MULTIPLE',
      'GENERAL_BAG_SINGLE'
    )
  ),
  title TEXT NOT NULL CHECK (length(title) > 0),
  description TEXT NOT NULL CHECK (length(description) > 0),
  cta TEXT NOT NULL CHECK (length(cta) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.disposal_guide_hazardous_keywords (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword TEXT NOT NULL CHECK (length(keyword) > 0),
  category TEXT NOT NULL CHECK (category IN ('PHARMACEUTICAL', 'HAZARDOUS_WASTE')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, keyword)
);

CREATE INDEX IF NOT EXISTS disposal_guide_step_choices_active_idx
  ON public.disposal_guide_step_choices (step, sort_order)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS disposal_guide_recommendation_rules_active_idx
  ON public.disposal_guide_recommendation_rules (priority)
  WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS disposal_guide_recommendation_rules_active_priority_uniq
  ON public.disposal_guide_recommendation_rules (priority)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS disposal_guide_recommendation_rules_condition_gin_idx
  ON public.disposal_guide_recommendation_rules USING GIN (condition);

CREATE INDEX IF NOT EXISTS disposal_guide_hazardous_keywords_active_idx
  ON public.disposal_guide_hazardous_keywords (category, sort_order)
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.disposal_guide_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS disposal_guide_step_choices_set_updated_at
  ON public.disposal_guide_step_choices;
CREATE TRIGGER disposal_guide_step_choices_set_updated_at
  BEFORE UPDATE ON public.disposal_guide_step_choices
  FOR EACH ROW
  EXECUTE FUNCTION public.disposal_guide_set_updated_at();

DROP TRIGGER IF EXISTS disposal_guide_recommendation_rules_set_updated_at
  ON public.disposal_guide_recommendation_rules;
CREATE TRIGGER disposal_guide_recommendation_rules_set_updated_at
  BEFORE UPDATE ON public.disposal_guide_recommendation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.disposal_guide_set_updated_at();

DROP TRIGGER IF EXISTS disposal_guide_result_copy_set_updated_at
  ON public.disposal_guide_result_copy;
CREATE TRIGGER disposal_guide_result_copy_set_updated_at
  BEFORE UPDATE ON public.disposal_guide_result_copy
  FOR EACH ROW
  EXECUTE FUNCTION public.disposal_guide_set_updated_at();

DROP TRIGGER IF EXISTS disposal_guide_hazardous_keywords_set_updated_at
  ON public.disposal_guide_hazardous_keywords;
CREATE TRIGGER disposal_guide_hazardous_keywords_set_updated_at
  BEFORE UPDATE ON public.disposal_guide_hazardous_keywords
  FOR EACH ROW
  EXECUTE FUNCTION public.disposal_guide_set_updated_at();

ALTER TABLE public.disposal_guide_step_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposal_guide_recommendation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposal_guide_result_copy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposal_guide_hazardous_keywords ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.disposal_guide_step_choices TO anon;
GRANT SELECT ON public.disposal_guide_recommendation_rules TO anon;
GRANT SELECT ON public.disposal_guide_result_copy TO anon;
GRANT SELECT ON public.disposal_guide_hazardous_keywords TO anon;

DROP POLICY IF EXISTS "disposal guide active choices are public readable"
  ON public.disposal_guide_step_choices;
CREATE POLICY "disposal guide active choices are public readable"
  ON public.disposal_guide_step_choices
  FOR SELECT
  TO anon
  USING (is_active = true);

DROP POLICY IF EXISTS "disposal guide active rules are public readable"
  ON public.disposal_guide_recommendation_rules;
CREATE POLICY "disposal guide active rules are public readable"
  ON public.disposal_guide_recommendation_rules
  FOR SELECT
  TO anon
  USING (is_active = true);

DROP POLICY IF EXISTS "disposal guide active result copy is public readable"
  ON public.disposal_guide_result_copy;
CREATE POLICY "disposal guide active result copy is public readable"
  ON public.disposal_guide_result_copy
  FOR SELECT
  TO anon
  USING (is_active = true);

DROP POLICY IF EXISTS "disposal guide active hazardous keywords are public readable"
  ON public.disposal_guide_hazardous_keywords;
CREATE POLICY "disposal guide active hazardous keywords are public readable"
  ON public.disposal_guide_hazardous_keywords
  FOR SELECT
  TO anon
  USING (is_active = true);
