INSERT INTO public.disposal_guide_step_choices
  (step, choice_id, label, description, sort_order, is_active)
VALUES
  ('category', 'GENERAL_FOOD_RECYCLE', '재활용 · 음식물 · 일반 쓰레기', NULL, 10, true),
  ('category', 'APPLIANCE_FURNITURE', '가전 · 가구', NULL, 20, true),
  ('category', 'BEDDING_CLOTHES_MISC', '이불 · 의류 · 잡화', NULL, 30, true),
  ('category', 'ETC', '기타', NULL, 40, true),
  ('weight', 'UNDER_15', '15kg 이하', '혼자 어렵지 않게 들 수 있어요', 10, true),
  ('weight', 'OVER_15_UNDER_25', '15kg 초과 ~ 25kg 미만', '들 수는 있지만 오래 들기 어렵거나 꽤 무거워요', 20, true),
  ('weight', 'OVER_25', '25kg 이상', '혼자 들기 어렵거나 두 사람이 들어야 해요', 30, true),
  ('weight', 'UNKNOWN', '잘 모르겠어요', NULL, 40, true),
  ('perceived_weight', 'EASY_TO_LIFT', '어렵지 않게 들 수 있어요', NULL, 10, true),
  ('perceived_weight', 'HARD_TO_HOLD_LONG', '들 수는 있지만 오래 들기 어려워요', NULL, 20, true),
  ('perceived_weight', 'HARD_TO_LIFT', '혼자 들기 어려워요', NULL, 30, true),
  ('splittable', 'CAN_SPLIT', '네, 여러 봉투에 나눠 담을 수 있어요', NULL, 10, true),
  ('splittable', 'CANNOT_SPLIT', '아니요, 하나로만 버려야 하는 물건이에요', NULL, 20, true),
  ('splittable', 'UNKNOWN', '잘 모르겠어요', NULL, 30, true)
ON CONFLICT (step, choice_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

INSERT INTO public.disposal_guide_recommendation_rules
  (rule_id, priority, condition, action, is_active)
VALUES
  (
    'general-only-heavy',
    10,
    '{"categoryMode":"GENERAL_ONLY","anyOf":[{"weightIn":["OVER_15_UNDER_25","OVER_25"]},{"perceivedWeightIn":["HARD_TO_LIFT"]}]}'::jsonb,
    'GENERAL_BAG_MULTIPLE',
    true
  ),
  (
    'general-only-default',
    20,
    '{"categoryMode":"GENERAL_ONLY"}'::jsonb,
    'GENERAL_BAG_SINGLE',
    true
  ),
  (
    'splittable-heavy-bag-length',
    30,
    '{"categoryMode":"SPLITTABLE_ONLY","bagAcceptableLength":true,"anyOf":[{"weightIn":["OVER_25"]},{"perceivedWeightIn":["HARD_TO_LIFT"]}]}'::jsonb,
    'GENERAL_BAG_MULTIPLE',
    true
  ),
  (
    'weight-over-25',
    40,
    '{"weightIn":["OVER_25"],"not":{"categoryMode":"SPLITTABLE_ONLY"}}'::jsonb,
    'VISIT_PICKUP',
    true
  ),
  (
    'perceived-hard-to-lift',
    50,
    '{"perceivedWeightIn":["HARD_TO_LIFT"],"not":{"categoryMode":"SPLITTABLE_ONLY"}}'::jsonb,
    'VISIT_PICKUP',
    true
  ),
  ('length-over-150', 60, '{"lengthIn":["OVER_150"]}'::jsonb, 'VISIT_PICKUP', true),
  ('length-141-150', 70, '{"lengthIn":["OVER_140_UNDER_150"]}'::jsonb, 'LARGE_COVERING_BAG', true),
  (
    'length-86-140-heavy',
    80,
    '{"lengthIn":["OVER_80_UNDER_140"],"weightIn":["OVER_15_UNDER_25"]}'::jsonb,
    'HEAVY_SPLIT_DECISION',
    true
  ),
  ('length-86-140-default', 90, '{"lengthIn":["OVER_80_UNDER_140"]}'::jsonb, 'LARGE_COVERING_BAG', true),
  (
    'bag-length-heavy',
    100,
    '{"lengthIn":["UNDER_80","AROUND_80"],"weightIn":["OVER_15_UNDER_25"]}'::jsonb,
    'HEAVY_SPLIT_DECISION',
    true
  ),
  ('bag-length-default', 110, '{"lengthIn":["UNDER_80","AROUND_80"]}'::jsonb, 'GENERAL_BAG_SINGLE', true),
  ('default', 1000, '{}'::jsonb, 'GENERAL_BAG_SINGLE', true)
ON CONFLICT (rule_id) DO UPDATE SET
  priority = EXCLUDED.priority,
  condition = EXCLUDED.condition,
  action = EXCLUDED.action,
  is_active = EXCLUDED.is_active;

INSERT INTO public.disposal_guide_result_copy
  (recommendation, title, description, cta, sort_order, is_active)
VALUES
  (
    'VISIT_PICKUP',
    '커버링 방문 수거를 추천해요',
    '총 무게가 25kg을 넘거나 길이가 150cm를 넘는 대형 · 대량 폐기물은 봉투 수거가 어려워요. 집 안으로 들어가 전문 기사님들이 직접 옮겨 수거하는 방문수거를 추천해드려요.',
    '카카오톡으로 견적받기',
    10,
    true
  ),
  (
    'LARGE_COVERING_BAG',
    '대형 커버링 봉투에 버려주세요',
    '길이가 80cm를 넘거나, 봉투에 나눠 버릴 수 없는 큰 물품은 일반 커버링 봉투에 담기 어려워요. 대형 커버링 봉투가 더 적합해요.',
    '대형 커버링 봉투 신청하기',
    20,
    true
  ),
  (
    'GENERAL_BAG_SINGLE',
    '일반 커버링 봉투에 버려주세요',
    '길이가 80cm 이하이고 총 무게가 15kg을 넘지 않는 폐기물은 분리, 세척없이 일반 커버링 봉투에 담아 문 앞에 배출하면 기사님이 새벽 사이에 수거해 가요.',
    '일반 커버링 봉투 신청하기',
    30,
    true
  ),
  (
    'GENERAL_BAG_MULTIPLE',
    '일반 커버링 봉투 여러 장을 추천해요',
    '부피가 작지만, 만약 양이 많다면 일반 커버링 봉투 한 봉투에 모두 담기보다 여러 장에 나눠 담는 것이 안전해요. 한 봉투에 15kg을 넘지 않도록 나눠 담아주세요.',
    '일반 커버링 봉투 신청하기',
    40,
    true
  )
ON CONFLICT (recommendation) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  cta = EXCLUDED.cta,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

INSERT INTO public.disposal_guide_hazardous_keywords
  (keyword, category, sort_order, source, is_active)
VALUES
  ('폐의약품', 'PHARMACEUTICAL', 10, 'seed', true),
  ('의약품', 'PHARMACEUTICAL', 20, 'seed', true),
  ('처방약', 'PHARMACEUTICAL', 30, 'seed', true),
  ('조제약', 'PHARMACEUTICAL', 40, 'seed', true),
  ('알약', 'PHARMACEUTICAL', 50, 'seed', true),
  ('정제', 'PHARMACEUTICAL', 60, 'seed', true),
  ('캡슐', 'PHARMACEUTICAL', 70, 'seed', true),
  ('가루약', 'PHARMACEUTICAL', 80, 'seed', true),
  ('분말약', 'PHARMACEUTICAL', 90, 'seed', true),
  ('연질캡슐', 'PHARMACEUTICAL', 100, 'seed', true),
  ('시럽약', 'PHARMACEUTICAL', 110, 'seed', true),
  ('물약', 'PHARMACEUTICAL', 120, 'seed', true),
  ('안약', 'PHARMACEUTICAL', 130, 'seed', true),
  ('점안액', 'PHARMACEUTICAL', 140, 'seed', true),
  ('연고약', 'PHARMACEUTICAL', 150, 'seed', true),
  ('파스', 'PHARMACEUTICAL', 160, 'seed', true),
  ('의료용 패치', 'PHARMACEUTICAL', 170, 'seed', true),
  ('인슐린', 'PHARMACEUTICAL', 180, 'seed', true),
  ('주사제', 'PHARMACEUTICAL', 190, 'seed', true),
  ('주사기', 'PHARMACEUTICAL', 200, 'seed', true),
  ('주사바늘', 'PHARMACEUTICAL', 210, 'seed', true),
  ('주삿바늘', 'PHARMACEUTICAL', 220, 'seed', true),
  ('주사침', 'PHARMACEUTICAL', 230, 'seed', true),
  ('인슐린펜', 'PHARMACEUTICAL', 240, 'seed', true),
  ('흡입제', 'PHARMACEUTICAL', 250, 'seed', true),
  ('백신', 'PHARMACEUTICAL', 260, 'seed', true),
  ('감기약', 'PHARMACEUTICAL', 270, 'seed', true),
  ('항생제', 'PHARMACEUTICAL', 280, 'seed', true),
  ('진통제', 'PHARMACEUTICAL', 290, 'seed', true),
  ('해열제', 'PHARMACEUTICAL', 300, 'seed', true),
  ('소화제', 'PHARMACEUTICAL', 310, 'seed', true),
  ('변비약', 'PHARMACEUTICAL', 320, 'seed', true),
  ('수면제', 'PHARMACEUTICAL', 330, 'seed', true),
  ('한약', 'PHARMACEUTICAL', 340, 'seed', true),
  ('한약재', 'PHARMACEUTICAL', 350, 'seed', true),
  ('탕약', 'PHARMACEUTICAL', 360, 'seed', true),
  ('비타민제', 'PHARMACEUTICAL', 370, 'seed', true),
  ('영양제', 'PHARMACEUTICAL', 380, 'seed', true),
  ('건강기능식품 알약', 'PHARMACEUTICAL', 390, 'seed', true),
  ('수은체온계', 'HAZARDOUS_WASTE', 1000, 'seed', true),
  ('수은온도계', 'HAZARDOUS_WASTE', 1010, 'seed', true),
  ('수은혈압계', 'HAZARDOUS_WASTE', 1020, 'seed', true),
  ('수은', 'HAZARDOUS_WASTE', 1030, 'seed', true),
  ('폐페인트', 'HAZARDOUS_WASTE', 1040, 'seed', true),
  ('페인트', 'HAZARDOUS_WASTE', 1050, 'seed', true),
  ('시너', 'HAZARDOUS_WASTE', 1060, 'seed', true),
  ('신너', 'HAZARDOUS_WASTE', 1070, 'seed', true),
  ('솔벤트', 'HAZARDOUS_WASTE', 1080, 'seed', true),
  ('락카', 'HAZARDOUS_WASTE', 1090, 'seed', true),
  ('래커', 'HAZARDOUS_WASTE', 1100, 'seed', true),
  ('스프레이 페인트', 'HAZARDOUS_WASTE', 1110, 'seed', true),
  ('바니쉬', 'HAZARDOUS_WASTE', 1120, 'seed', true),
  ('본드 대량', 'HAZARDOUS_WASTE', 1130, 'seed', true),
  ('농약', 'HAZARDOUS_WASTE', 1140, 'seed', true),
  ('살충제', 'HAZARDOUS_WASTE', 1150, 'seed', true),
  ('제초제', 'HAZARDOUS_WASTE', 1160, 'seed', true),
  ('살균제', 'HAZARDOUS_WASTE', 1170, 'seed', true),
  ('쥐약', 'HAZARDOUS_WASTE', 1180, 'seed', true),
  ('바퀴벌레약', 'HAZARDOUS_WASTE', 1190, 'seed', true),
  ('폐 라이터', 'HAZARDOUS_WASTE', 1200, 'seed', true),
  ('가스라이터', 'HAZARDOUS_WASTE', 1210, 'seed', true),
  ('일회용 라이터', 'HAZARDOUS_WASTE', 1220, 'seed', true),
  ('부탄가스', 'HAZARDOUS_WASTE', 1230, 'seed', true),
  ('부탄가스통', 'HAZARDOUS_WASTE', 1240, 'seed', true),
  ('캠핑가스', 'HAZARDOUS_WASTE', 1250, 'seed', true),
  ('LPG통', 'HAZARDOUS_WASTE', 1260, 'seed', true),
  ('휴대용 가스통', 'HAZARDOUS_WASTE', 1270, 'seed', true),
  ('소화기', 'HAZARDOUS_WASTE', 1280, 'seed', true),
  ('폐 소화기', 'HAZARDOUS_WASTE', 1290, 'seed', true),
  ('폭죽', 'HAZARDOUS_WASTE', 1300, 'seed', true),
  ('화약', 'HAZARDOUS_WASTE', 1310, 'seed', true),
  ('불꽃놀이', 'HAZARDOUS_WASTE', 1320, 'seed', true),
  ('폐유', 'HAZARDOUS_WASTE', 1330, 'seed', true),
  ('엔진오일', 'HAZARDOUS_WASTE', 1340, 'seed', true),
  ('윤활유', 'HAZARDOUS_WASTE', 1350, 'seed', true),
  ('폐식용유 대량', 'HAZARDOUS_WASTE', 1360, 'seed', true),
  ('기계유', 'HAZARDOUS_WASTE', 1370, 'seed', true),
  ('의료폐기물', 'HAZARDOUS_WASTE', 1380, 'seed', true),
  ('거즈 사용', 'HAZARDOUS_WASTE', 1390, 'seed', true),
  ('메스', 'HAZARDOUS_WASTE', 1400, 'seed', true),
  ('수술용 칼날', 'HAZARDOUS_WASTE', 1410, 'seed', true)
ON CONFLICT (category, keyword) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  source = EXCLUDED.source,
  is_active = EXCLUDED.is_active;
