-- 033_brand_message.sql
-- 커버링 실험실 — 카카오톡 브랜드메시지 (스윗트래커 비즈메시지 v2.29.3) 발송 · 결과 추적 · 전환 분석
--
-- 권한: 김원빈 / 강성진 만 (실험실 도메인 전체)
-- 4.4만 명 / 4일 / Day 1 A·B 그룹 분리 발송 시나리오 대응.

-- ─── 캠페인 ───
create table if not exists brand_message_campaigns (
  id uuid primary key default gen_random_uuid(),
  label text not null,                              -- "Day 1 / A 그룹 (쿠폰)" 사람 친화적 이름
  group_tag text,                                   -- "1A" / "1B" / "2" / "3" / "4" — 그룹 식별 (전환 분석 매칭 키)
  message_type text not null default 'FW',          -- 'FT' / 'FI' / 'FW' (카카오 비즈메시지 타입)
  scheduled_at timestamptz,                         -- 예약발송 시각 (null = 즉시발송)
  status text not null default 'draft'              -- draft / scheduled / sending / completed / failed / cancelled
    check (status in ('draft','scheduled','sending','completed','failed','cancelled')),
  total_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  excel_filename text,                              -- 업로드된 엑셀 파일명 (감사용)
  notes text,                                       -- 자유 메모
  created_by text not null,                         -- 생성자 (user.name)
  created_at timestamptz not null default now(),
  started_at timestamptz,                           -- 실제 발송 시작 시각
  completed_at timestamptz                          -- 발송 완료 시각
);

create index if not exists idx_brand_campaigns_status on brand_message_campaigns(status);
create index if not exists idx_brand_campaigns_scheduled on brand_message_campaigns(scheduled_at)
  where status = 'scheduled';

-- ─── 수신자 (개별 수신자 + 메시지 + 발송 결과) ───
create table if not exists brand_message_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references brand_message_campaigns(id) on delete cascade,
  -- 수신자
  phone text not null,                              -- "01012345678" (하이픈 없는 11자리)
  msgid text not null,                              -- 발신프로필별 40일 unique — campaign_id 의 short prefix + row idx
  -- 메시지 내용 (excel 1행 = 1수신자 — 사실상 거의 동일하지만 row 별 자유 가능)
  message text not null,
  image_url text,                                   -- FW/FI 의 경우 사전 업로드된 카카오 이미지 URL
  image_link text,                                  -- 이미지 클릭 시 이동
  buttons jsonb,                                    -- [{name, type, url_mobile, url_pc, scheme_android, scheme_ios, ...}, ...]
  coupon jsonb,                                     -- {name, desc, url_mobile, ...}
  -- 발송 결과 (sweettracker 응답)
  sent_at timestamptz,
  result_code text,                                 -- 스윗트래커 결과 코드 (M0000 등)
  result_message text,
  origin_code text,                                 -- 카카오 원본 응답
  origin_error text,
  -- 전환 추적 (사후 매칭)
  converted_at timestamptz,                         -- 발송 후 N일 내 conversation/order 발생 시각
  converted_kind text,                              -- 'conversation' / 'order' / null
  converted_session_id text                         -- 매칭된 conversations.session_id
);

create unique index if not exists uq_brand_recipients_msgid on brand_message_recipients(msgid);
create index if not exists idx_brand_recipients_campaign on brand_message_recipients(campaign_id);
create index if not exists idx_brand_recipients_phone on brand_message_recipients(phone);
create index if not exists idx_brand_recipients_pending on brand_message_recipients(campaign_id) where sent_at is null;
create index if not exists idx_brand_recipients_converted on brand_message_recipients(converted_at) where converted_at is not null;

comment on table brand_message_campaigns is '실험실 — 브랜드메시지 발송 캠페인 (그룹 단위, A/B 분리, 즉시/예약)';
comment on table brand_message_recipients is '실험실 — 캠페인 내 개별 수신자 + 발송 결과 + 전환 추적';
comment on column brand_message_campaigns.group_tag is '전환 분석용 그룹 식별 — 추후 conversations/orders 와 phone 매칭하여 그룹별 전환율 비교';
comment on column brand_message_recipients.msgid is '스윗트래커 발신프로필 40일 unique 제약 — 영문/숫자/_/-만 허용, 중복 불가';
