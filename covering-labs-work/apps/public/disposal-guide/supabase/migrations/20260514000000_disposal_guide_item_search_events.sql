create table if not exists public.disposal_guide_item_search_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_name text not null check (
    event_name in ('item_description_submitted', 'restricted_item_detected')
  ),
  session_id text,
  app_user_id text,
  item_search_keyword text not null check (
    length(item_search_keyword) > 0
    and length(item_search_keyword) <= 80
  ),
  item_description_length integer check (
    item_description_length is null
    or item_description_length >= 0
  ),
  categories text[] not null default '{}',
  category_count integer check (
    category_count is null
    or category_count >= 0
  ),
  has_food_waste boolean,
  length_cm integer check (
    length_cm is null
    or length_cm >= 0
  ),
  length_range text,
  weight_range text,
  perceived_weight text,
  splittable_status text,
  recommendation text,
  is_restricted_item boolean not null default false,
  hazardous_category text check (
    hazardous_category is null
    or hazardous_category in ('PHARMACEUTICAL', 'HAZARDOUS_WASTE')
  ),
  hazardous_keyword text,
  source text,
  surface text,
  campaign text,
  variant text,
  referrer_from text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  view_path text
);

alter table public.disposal_guide_item_search_events
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists event_name text,
  add column if not exists session_id text,
  add column if not exists app_user_id text,
  add column if not exists item_search_keyword text,
  add column if not exists item_description_length integer,
  add column if not exists categories text[] not null default '{}',
  add column if not exists category_count integer,
  add column if not exists has_food_waste boolean,
  add column if not exists length_cm integer,
  add column if not exists length_range text,
  add column if not exists weight_range text,
  add column if not exists perceived_weight text,
  add column if not exists splittable_status text,
  add column if not exists recommendation text,
  add column if not exists is_restricted_item boolean not null default false,
  add column if not exists hazardous_category text,
  add column if not exists hazardous_keyword text,
  add column if not exists source text,
  add column if not exists surface text,
  add column if not exists campaign text,
  add column if not exists variant text,
  add column if not exists referrer_from text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists view_path text;

-- Keep idempotent runs from failing if an earlier table draft left nullable rows.
update public.disposal_guide_item_search_events
set event_name = 'item_description_submitted'
where event_name is null
  or event_name not in ('item_description_submitted', 'restricted_item_detected');

update public.disposal_guide_item_search_events
set item_search_keyword = left(trim(item_search_keyword), 80)
where item_search_keyword is not null
  and (
    item_search_keyword <> trim(item_search_keyword)
    or length(item_search_keyword) > 80
  );

update public.disposal_guide_item_search_events
set item_search_keyword = 'unknown'
where item_search_keyword is null
  or length(item_search_keyword) = 0;

alter table public.disposal_guide_item_search_events
  alter column event_name set not null,
  alter column item_search_keyword set not null;

alter table public.disposal_guide_item_search_events
  drop constraint if exists disposal_guide_item_search_events_event_name_check,
  add constraint disposal_guide_item_search_events_event_name_check check (
    event_name in ('item_description_submitted', 'restricted_item_detected')
  ),
  drop constraint if exists disposal_guide_item_search_events_item_search_keyword_check,
  add constraint disposal_guide_item_search_events_item_search_keyword_check check (
    length(item_search_keyword) > 0
    and length(item_search_keyword) <= 80
  );

create index if not exists disposal_guide_item_search_events_created_at_idx
  on public.disposal_guide_item_search_events (created_at desc);

create index if not exists disposal_guide_item_search_events_keyword_idx
  on public.disposal_guide_item_search_events (item_search_keyword);

create index if not exists disposal_guide_item_search_events_session_idx
  on public.disposal_guide_item_search_events (session_id)
  where session_id is not null;

alter table public.disposal_guide_item_search_events enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'disposal_guide_item_search_events'
  loop
    execute format(
      'drop policy if exists %I on public.disposal_guide_item_search_events',
      policy_record.policyname
    );
  end loop;
end $$;

revoke all on public.disposal_guide_item_search_events from anon;
revoke all on public.disposal_guide_item_search_events from authenticated;

do $$
begin
  if to_regclass('public.disposal_guide_item_search_events_id_seq') is not null then
    revoke all on sequence public.disposal_guide_item_search_events_id_seq from anon;
    revoke all on sequence public.disposal_guide_item_search_events_id_seq from authenticated;
  end if;
end $$;
