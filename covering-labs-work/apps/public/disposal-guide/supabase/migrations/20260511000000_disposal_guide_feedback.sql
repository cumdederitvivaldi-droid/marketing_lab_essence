create or replace function public.disposal_guide_feedback_jsonb_allowed_keys(
  payload jsonb,
  allowed_keys text[]
)
returns boolean
language sql
immutable
strict
as $$
  select jsonb_typeof(payload) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(payload) as object_key(key_name)
      where not (object_key.key_name = any (allowed_keys))
    );
$$;

create or replace function public.disposal_guide_feedback_jsonb_text_array_allowed(
  payload jsonb,
  field_name text,
  allowed_values text[]
)
returns boolean
language sql
immutable
strict
as $$
  select case
    when jsonb_typeof(payload -> field_name) is distinct from 'array' then false
    else not exists (
      select 1
      from jsonb_array_elements_text(payload -> field_name) as array_value(value)
      where not (array_value.value = any (allowed_values))
    )
  end;
$$;

create table public.disposal_guide_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sentiment text not null check (sentiment in ('positive', 'negative')),
  recommendation text not null check (
    recommendation in (
      'VISIT_PICKUP',
      'LARGE_COVERING_BAG',
      'GENERAL_BAG_MULTIPLE',
      'GENERAL_BAG_SINGLE'
    )
  ),
  app_state jsonb not null check (
    public.disposal_guide_feedback_jsonb_allowed_keys(
      app_state,
      array[
        'categories',
        'hasFoodWaste',
        'hasItemDescription',
        'itemDescriptionLength',
        'lengthCm',
        'lengthRange',
        'weightRange',
        'perceivedWeight',
        'splittableStatus',
        'recommendation'
      ]
    )
    and public.disposal_guide_feedback_jsonb_text_array_allowed(
      app_state,
      'categories',
      array[
        'GENERAL_FOOD_RECYCLE',
        'APPLIANCE_FURNITURE',
        'BEDDING_CLOTHES_MISC',
        'ETC'
      ]
    )
    and coalesce(jsonb_typeof(app_state -> 'hasFoodWaste') = 'boolean', false)
    and coalesce(jsonb_typeof(app_state -> 'hasItemDescription') = 'boolean', false)
    and coalesce(
      (app_state ->> 'lengthRange') in (
        'UNDER_80',
        'AROUND_80',
        'OVER_80_UNDER_140',
        'OVER_140_UNDER_150',
        'OVER_150'
      ),
      false
    )
    and coalesce(
      (app_state ->> 'weightRange') in (
        'UNDER_15',
        'OVER_15_UNDER_25',
        'OVER_25',
        'UNKNOWN'
      ),
      false
    )
    and coalesce(app_state ->> 'recommendation' = recommendation, false)
    and (
      not (app_state ? 'itemDescriptionLength')
      or coalesce(jsonb_typeof(app_state -> 'itemDescriptionLength') = 'number', false)
    )
    and (
      not (app_state ? 'lengthCm')
      or coalesce(jsonb_typeof(app_state -> 'lengthCm') = 'number', false)
    )
    and (
      not (app_state ? 'perceivedWeight')
      or coalesce(
        (app_state ->> 'perceivedWeight') in (
          'EASY_TO_LIFT',
          'HARD_TO_HOLD_LONG',
          'HARD_TO_LIFT'
        ),
        false
      )
    )
    and (
      not (app_state ? 'splittableStatus')
      or coalesce(
        (app_state ->> 'splittableStatus') in ('CAN_SPLIT', 'CANNOT_SPLIT', 'UNKNOWN'),
        false
      )
    )
  ),
  context jsonb not null check (
    public.disposal_guide_feedback_jsonb_allowed_keys(
      context,
      array[
        'appName',
        'guideName',
        'guideTitle',
        'environment',
        'sessionId',
        'viewPath',
        'url',
        'source',
        'surface',
        'campaign',
        'variant',
        'from',
        'utmSource',
        'utmMedium',
        'utmCampaign',
        'utmContent',
        'utmTerm',
        'appUserId',
        'userIdSource'
      ]
    )
    and coalesce(context ->> 'appName' = 'disposal-guide', false)
    and coalesce(context ->> 'guideName' = 'service_recommendation', false)
    and coalesce(context ->> 'guideTitle' = '서비스 추천', false)
    and (
      not (context ? 'url')
      or (
        char_length(context ->> 'url') <= 1000
        and (context ->> 'url') ~ '^https?://[^[:space:]]+$'
      )
    )
  ),
  source varchar(120),
  url varchar(1000) check (url is null or url ~ '^https?://[^[:space:]]+$'),
  user_agent varchar(1000),
  referer varchar(1000) check (referer is null or referer ~ '^https?://[^[:space:]]+$'),
  slack_status text not null default 'pending' check (
    slack_status in ('pending', 'sent', 'skipped_missing_config', 'failed')
  ),
  slack_ts varchar(80),
  slack_error varchar(300)
);

create index if not exists disposal_guide_feedback_created_at_idx
  on public.disposal_guide_feedback (created_at desc);

create index if not exists disposal_guide_feedback_sentiment_idx
  on public.disposal_guide_feedback (sentiment, created_at desc);

alter table public.disposal_guide_feedback enable row level security;

revoke all on public.disposal_guide_feedback from anon;
revoke all on public.disposal_guide_feedback from authenticated;
