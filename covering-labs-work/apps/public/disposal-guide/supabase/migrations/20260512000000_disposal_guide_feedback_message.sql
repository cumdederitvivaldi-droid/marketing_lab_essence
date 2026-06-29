alter table public.disposal_guide_feedback
  add column if not exists message varchar(500);
