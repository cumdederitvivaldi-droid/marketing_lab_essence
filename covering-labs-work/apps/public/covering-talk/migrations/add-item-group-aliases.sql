-- ============================================================
-- 품목 매핑 개선: item_group + aliases 컬럼 추가
-- Supabase SQL Editor에서 실행
-- ============================================================

-- Step 1: 컬럼 추가
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS item_group TEXT,
  ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_products_item_group ON products(item_group);

-- ============================================================
-- Step 2: item_group 매핑
-- ============================================================

-- 2-1. category가 이미 고객 언어와 일치하는 항목 → item_group = category
UPDATE products SET item_group = category
WHERE category IN (
  '장롱', '소파', '침대', '장식장', '거실장', '식탁', '테이블',
  '책상', '캐비닛', '화장대', '책장', '신발장', '서랍장', '탁자',
  '욕실', '악기', '포장', '잡동사니', '유아', '사무', '수납',
  '반려동물', '레저', '공구'
);

-- 2-2. "가전" 세분화 → name 기반으로 item_group 지정
UPDATE products SET item_group = '냉장고'   WHERE category = '가전' AND name ILIKE '%냉장고%';
UPDATE products SET item_group = '세탁기'   WHERE category = '가전' AND name ILIKE '%세탁기%';
UPDATE products SET item_group = '에어컨'   WHERE category = '가전' AND name ILIKE '%에어컨%';
UPDATE products SET item_group = 'TV'       WHERE category = '가전' AND name ILIKE 'TV%';
UPDATE products SET item_group = '모니터'   WHERE category = '가전' AND name ILIKE '%모니터%';
UPDATE products SET item_group = '프린터'   WHERE category = '가전' AND name ILIKE '%프린터%';
UPDATE products SET item_group = '스피커'   WHERE category = '가전' AND (name ILIKE '%스피커%' OR name ILIKE '%사운드바%');
UPDATE products SET item_group = '청소기'   WHERE category = '가전' AND name ILIKE '%청소기%';
UPDATE products SET item_group = '선풍기'   WHERE category = '가전' AND name ILIKE '%선풍기%';
UPDATE products SET item_group = '공기청정기' WHERE category = '가전' AND name ILIKE '%공기청정기%';
-- 나머지 가전: 건조기, 스타일러, 제습기, 가습기 등 → name 자체가 item_group
UPDATE products SET item_group = name WHERE category = '가전' AND item_group IS NULL;

-- 2-3. "기타가전" → name 자체를 item_group으로
UPDATE products SET item_group = name WHERE category = '기타가전' AND item_group IS NULL;

-- 2-4. "주방" 세분화
UPDATE products SET item_group = '정수기'   WHERE category = '주방' AND name ILIKE '%정수기%';
UPDATE products SET item_group = '씽크대'   WHERE category = '주방' AND name ILIKE '%씽크대%';
UPDATE products SET item_group = name       WHERE category = '주방' AND item_group IS NULL;

-- 2-5~8. 건강, 운동, 계절, 기타 → name 기반
UPDATE products SET item_group = name WHERE category = '건강' AND item_group IS NULL;
UPDATE products SET item_group = name WHERE category = '운동' AND item_group IS NULL;
UPDATE products SET item_group = name WHERE category = '계절' AND item_group IS NULL;
UPDATE products SET item_group = name WHERE category = '기타' AND item_group IS NULL;

-- 2-9. 혹시 남은 NULL 처리
UPDATE products SET item_group = category WHERE item_group IS NULL;


-- ============================================================
-- Step 3: aliases 포괄 설정
-- ============================================================
-- ⚠️ 중요: 동의어는 반드시 "복합 표현"으로!
--   좋은 예: "스탠드에어컨" (구체적, 충돌 없음)
--   나쁜 예: "스탠드" (에어컨? 선풍기? 조명? → 충돌!)

-- ── 냉장고 ──
UPDATE products SET aliases = ARRAY['양문형냉장고', '대형냉장고', '큰냉장고', '사이드바이사이드']
WHERE item_group = '냉장고' AND name ILIKE '%양문형%';

UPDATE products SET aliases = ARRAY['소형냉장고', '미니냉장고', '작은냉장고', '원룸냉장고', '중형냉장고']
WHERE item_group = '냉장고' AND name ILIKE '%중형%';

UPDATE products SET aliases = ARRAY['김치냉장고스탠드', '스탠드김치냉장고']
WHERE item_group = '냉장고' AND name ILIKE '%김치%스탠드%';

UPDATE products SET aliases = ARRAY['김치냉장고뚜껑', '뚜껑형김치냉장고']
WHERE item_group = '냉장고' AND name ILIKE '%김치%뚜껑%';

-- ── 세탁기 ──
UPDATE products SET aliases = ARRAY['통돌이', '일반세탁기', '통돌이세탁기']
WHERE item_group = '세탁기' AND name ILIKE '%일반%';

UPDATE products SET aliases = ARRAY['드럼세탁기', '드럼']
WHERE item_group = '세탁기' AND name ILIKE '%트럼%';

-- ── 에어컨 ──
UPDATE products SET aliases = ARRAY['벽걸이에어컨', '벽걸이형에어컨']
WHERE item_group = '에어컨' AND name ILIKE '%벽걸이%';

UPDATE products SET aliases = ARRAY['스탠드에어컨', '스탠드형에어컨', '타워에어컨']
WHERE item_group = '에어컨' AND name ILIKE '%스탠드%';

UPDATE products SET aliases = ARRAY['투인원에어컨', '2in1에어컨']
WHERE item_group = '에어컨' AND name ILIKE '%2in1%';

-- ── TV ──
UPDATE products SET aliases = ARRAY['32인치TV', '32인치티비', '소형TV', '소형티비']
WHERE item_group = 'TV' AND name ILIKE '%32%';

UPDATE products SET aliases = ARRAY['50인치TV', '50인치티비']
WHERE item_group = 'TV' AND name ILIKE '%50%';

UPDATE products SET aliases = ARRAY['65인치TV', '65인치티비']
WHERE item_group = 'TV' AND name ILIKE '%65%';

UPDATE products SET aliases = ARRAY['75인치TV', '75인치티비', '대형TV', '대형티비']
WHERE item_group = 'TV' AND name ILIKE '%75%';

-- ── 장롱 ──
UPDATE products SET aliases = ARRAY['장농3자', '옷장3자', '3자장롱', '3자장농']
WHERE category = '장롱' AND name = '3자';

UPDATE products SET aliases = ARRAY['장농4자', '옷장4자', '4자장롱', '4자장농']
WHERE category = '장롱' AND name = '4자';

UPDATE products SET aliases = ARRAY['붙박이장1칸', '빌트인옷장1칸', '붙박이']
WHERE category = '장롱' AND name ILIKE '%붙박이%(1칸)%';

UPDATE products SET aliases = ARRAY['붙박이장2칸', '빌트인옷장2칸']
WHERE category = '장롱' AND name ILIKE '%붙박이%(2칸)%';

UPDATE products SET aliases = ARRAY['붙박이장3칸', '빌트인옷장3칸']
WHERE category = '장롱' AND name ILIKE '%붙박이%(3칸)%';

UPDATE products SET aliases = ARRAY['아이옷장', '아동옷장', '주니어장롱', '아기장롱', '애기장롱', '아이장롱', '애들장롱', '아기장농', '애기장농', '아이장농', '애들장농', '아동장롱', '아기옷장', '애기옷장', '애들옷장']
WHERE category = '장롱' AND name ILIKE '%주니어%';

UPDATE products SET aliases = ARRAY['작은드레스룸', '소형드레스룸']
WHERE category = '장롱' AND name ILIKE '%드레스룸(소)%';

UPDATE products SET aliases = ARRAY['큰드레스룸', '대형드레스룸']
WHERE category = '장롱' AND name ILIKE '%드레스룸(대)%';

-- ── 소파 ──
UPDATE products SET aliases = ARRAY['1인소파', '1인용소파', '소형소파', '작은소파', '미니소파', '조그만소파', '아이소파', '아기소파', '애기소파', '아동소파']
WHERE category = '소파' AND name = '1인용';

UPDATE products SET aliases = ARRAY['2인소파', '2인용소파']
WHERE category = '소파' AND name = '2인용';

UPDATE products SET aliases = ARRAY['3인소파', '3인용소파']
WHERE category = '소파' AND name = '3인용';

UPDATE products SET aliases = ARRAY['4인소파', '4인용소파', '대형소파', '큰소파']
WHERE category = '소파' AND name = '4인용';

UPDATE products SET aliases = ARRAY['5인소파', '5인용소파']
WHERE category = '소파' AND name = '5인용';

UPDATE products SET aliases = ARRAY['L자소파', 'L소파', '코너소파', 'ㄱ자소파', 'L형소파']
WHERE category = '소파' AND name ILIKE '%L자형%';

UPDATE products SET aliases = ARRAY['1인리클라이너', '리클라이너소파1인']
WHERE category = '소파' AND name ILIKE '%리클라이너 1인%';

UPDATE products SET aliases = ARRAY['2인리클라이너', '리클라이너소파2인']
WHERE category = '소파' AND name ILIKE '%리클라이너 2인%';

UPDATE products SET aliases = ARRAY['소파침대', '베드소파']
WHERE category = '소파' AND name ILIKE '%소파베드%';

-- ── 침대 ──
UPDATE products SET aliases = ARRAY['싱글침대프레임', '1인침대프레임']
WHERE category = '침대' AND name = '싱글(프레임만)';

UPDATE products SET aliases = ARRAY['슈퍼싱글프레임', 'SS침대프레임']
WHERE category = '침대' AND name = '수퍼싱글(프레임만)';

UPDATE products SET aliases = ARRAY['더블침대프레임', '2인침대프레임']
WHERE category = '침대' AND name = '더블(프레임만)';

UPDATE products SET aliases = ARRAY['퀸침대프레임']
WHERE category = '침대' AND name = '퀸(프레임만)';

UPDATE products SET aliases = ARRAY['킹침대프레임']
WHERE category = '침대' AND name = '킹(프레임만)';

UPDATE products SET aliases = ARRAY['싱글침대세트', '싱글침대', '1인침대', '소형침대', '작은침대', '미니침대', '아이침대', '아기침대', '애기침대', '애들침대', '아동침대']
WHERE category = '침대' AND name = '싱글 SET';

UPDATE products SET aliases = ARRAY['슈퍼싱글세트', '수퍼싱글침대', 'SS침대']
WHERE category = '침대' AND name = '수퍼싱글 SET';

UPDATE products SET aliases = ARRAY['더블침대세트', '더블침대', '2인침대']
WHERE category = '침대' AND name = '더블 SET';

UPDATE products SET aliases = ARRAY['퀸침대세트', '퀸침대', '퀸사이즈침대', '큰침대', '대형침대']
WHERE category = '침대' AND name = '퀸 SET';

UPDATE products SET aliases = ARRAY['킹침대세트', '킹침대', '킹사이즈침대']
WHERE category = '침대' AND name = '킹 SET';

UPDATE products SET aliases = ARRAY['이층침대', '벙커침대', '2층침대세트']
WHERE category = '침대' AND name ILIKE '%2층%';

UPDATE products SET aliases = ARRAY['돌침대1인', '옥침대1인', '흙침대1인']
WHERE category = '침대' AND name ILIKE '%돌/흙%1인%';

UPDATE products SET aliases = ARRAY['돌침대2인', '옥침대2인', '흙침대2인']
WHERE category = '침대' AND name ILIKE '%돌/흙%2인%';

UPDATE products SET aliases = ARRAY['싱글매트리스']
WHERE category = '침대' AND name = '매트리스 싱글';

UPDATE products SET aliases = ARRAY['슈퍼싱글매트리스', 'SS매트리스']
WHERE category = '침대' AND name = '매트리스 수퍼싱글';

UPDATE products SET aliases = ARRAY['더블매트리스']
WHERE category = '침대' AND name = '매트리스 더블';

UPDATE products SET aliases = ARRAY['퀸매트리스']
WHERE category = '침대' AND name = '매트리스 퀸';

UPDATE products SET aliases = ARRAY['킹매트리스']
WHERE category = '침대' AND name = '매트리스 킹';

-- ── 식탁 ──
UPDATE products SET aliases = ARRAY['대리석식탁', '대리석식탁세트']
WHERE category = '식탁' AND name ILIKE '%대리석%';

UPDATE products SET aliases = ARRAY['원목식탁', '원목식탁세트']
WHERE category = '식탁' AND name ILIKE '%원목%';

UPDATE products SET aliases = ARRAY['6인식탁', '6인이상식탁', '대형식탁']
WHERE category = '식탁' AND name ILIKE '%6인용이상%';

UPDATE products SET aliases = ARRAY['4인식탁', '4인이하식탁', '소형식탁']
WHERE category = '식탁' AND name ILIKE '%6인용미만%';

UPDATE products SET aliases = ARRAY['아일랜드식탁', '아일랜드테이블']
WHERE category = '식탁' AND name ILIKE '%아일랜드%';

UPDATE products SET aliases = ARRAY['식탁의자', '의자1개']
WHERE category = '식탁' AND name ILIKE '%의자 1개%';

-- ── 책상 ──
UPDATE products SET aliases = ARRAY['학생책상', '공부책상', '학원책상', '소형책상', '작은책상', '미니책상', '조그만책상', '아이책상', '아기책상', '애들책상', '애기책상', '아동책상']
WHERE category = '책상' AND name = '학생책상';

UPDATE products SET aliases = ARRAY['컴퓨터책상', 'PC책상', '컴책상', '대형책상', '큰책상']
WHERE category = '책상' AND name = '컴퓨터책상';

UPDATE products SET aliases = ARRAY['스탠딩데스크', '전동책상', '모션데스크']
WHERE category = '책상' AND name = '스탠딩책상';

UPDATE products SET aliases = ARRAY['H형책상서랍', '서랍책상']
WHERE category = '책상' AND name ILIKE '%H형%서랍형%';

-- ── 책장 ──
UPDATE products SET aliases = ARRAY['작은책장', '소형책장', '1.5m이하책장', '미니책장', '조그만책장']
WHERE category = '책장' AND name = '1.5m이하';

UPDATE products SET aliases = ARRAY['중형책장', '2m이하책장', '큰책장', '대형책장']
WHERE category = '책장' AND name = '2m이하';

UPDATE products SET aliases = ARRAY['초대형책장', '4m이하책장']
WHERE category = '책장' AND name = '4m이하';

-- ── 서랍장 ──
UPDATE products SET aliases = ARRAY['소형서랍장', '3단서랍장', '작은서랍장', '미니서랍장', '조그만서랍장', '아이서랍장', '아기서랍장', '애기서랍장', '아동서랍장']
WHERE category = '서랍장' AND name = '3단이하';

UPDATE products SET aliases = ARRAY['대형서랍장', '6단서랍장', '큰서랍장']
WHERE category = '서랍장' AND name = '6단이하';

-- ── 청소기 ──
UPDATE products SET aliases = ARRAY['일반청소기', '유선청소기']
WHERE item_group = '청소기' AND name ILIKE '%일반%';

UPDATE products SET aliases = ARRAY['무선청소기', '핸디청소기', '스틱청소기']
WHERE item_group = '청소기' AND name ILIKE '%무선%';

UPDATE products SET aliases = ARRAY['로봇청소기', '자동청소기']
WHERE item_group = '청소기' AND name ILIKE '%로봇%';

-- ── 선풍기 ──
UPDATE products SET aliases = ARRAY['스탠드선풍기', '키큰선풍기']
WHERE category = '가전' AND name ILIKE '%선풍기(스탠드)%';

UPDATE products SET aliases = ARRAY['타워선풍기', '타워형선풍기']
WHERE category = '가전' AND name ILIKE '%선풍기(타워형)%';

UPDATE products SET aliases = ARRAY['박스형선풍기', '네모선풍기']
WHERE category = '계절' AND name ILIKE '%선풍기(박스형)%';

-- ── 공기청정기 ──
UPDATE products SET aliases = ARRAY['대형공기청정기', '거실용공기청정기']
WHERE item_group = '공기청정기' AND name ILIKE '%대형%';

UPDATE products SET aliases = ARRAY['소형공기청정기', '방용공기청정기']
WHERE item_group = '공기청정기' AND name ILIKE '%소형%';

-- ── 건조기 / 스타일러 ──
UPDATE products SET aliases = ARRAY['의류건조기', '빨래건조기기기']
WHERE item_group = '건조기';

UPDATE products SET aliases = ARRAY['LG스타일러', '의류관리기가전']
WHERE category = '가전' AND name = '스타일러';

-- ── 주방 ──
UPDATE products SET aliases = ARRAY['식세기', '디쉬워셔']
WHERE category = '주방' AND name = '식기세척기';

UPDATE products SET aliases = ARRAY['전자렌지', '전레인지']
WHERE category = '주방' AND name = '전자레인지';

UPDATE products SET aliases = ARRAY['가스레인지', '오븐레인지']
WHERE category = '주방' AND name = '가스오븐레인지';

UPDATE products SET aliases = ARRAY['커피머신', '에스프레소머신']
WHERE category = '주방' AND name = '커피머신';

UPDATE products SET aliases = ARRAY['와인냉장고', '와인쿨러']
WHERE category = '주방' AND name = '와인냉장고';

UPDATE products SET aliases = ARRAY['스탠드정수기', '스탠드형정수기']
WHERE category = '주방' AND name ILIKE '%정수기(스탠드)%';

UPDATE products SET aliases = ARRAY['냉온수정수기', '냉온수기']
WHERE category = '주방' AND name ILIKE '%정수기(냉온수)%';

-- ── 운동 ──
UPDATE products SET aliases = ARRAY['트레드밀', '러닝머신', '달리기기구']
WHERE category = '운동' AND name = '런닝머신';

UPDATE products SET aliases = ARRAY['실내자전거', '스핀바이크', '헬스자전거']
WHERE category = '운동' AND name = '사이클';

UPDATE products SET aliases = ARRAY['노젓기기구', '로잉']
WHERE category = '운동' AND name = '로잉머신';

-- ── 악기 ──
UPDATE products SET aliases = ARRAY['디지털피아노', '전자피아노', '전건']
WHERE category = '악기' AND name ILIKE '%전자%디지털%';

UPDATE products SET aliases = ARRAY['어쿠스틱피아노', '피아노']
WHERE category = '악기' AND name ILIKE '%업라이트%';

UPDATE products SET aliases = ARRAY['그랜드피아노']
WHERE category = '악기' AND name ILIKE '%그랜드%';

-- ── 건강 ──
UPDATE products SET aliases = ARRAY['마사지체어', '안마기']
WHERE category = '건강' AND name = '안마의자';

UPDATE products SET aliases = ARRAY['안마침대', '마사지침대']
WHERE category = '건강' AND name ILIKE '%안마침대%';

UPDATE products SET aliases = ARRAY['워커', '보행보조기']
WHERE category = '건강' AND name = '워킹머신';

-- ── 기타가전 ──
UPDATE products SET aliases = ARRAY['와인셀러', '와인저장고']
WHERE category = '기타가전' AND name = '와인셀러';

UPDATE products SET aliases = ARRAY['얼음정수기', '제빙정수기']
WHERE category = '기타가전' AND name = '얼음정수기';

UPDATE products SET aliases = ARRAY['의류관리기', '옷관리기']
WHERE category = '기타가전' AND name = '의류관리기';

-- ── 계절 ──
UPDATE products SET aliases = ARRAY['전기매트', '전기장판']
WHERE category = '계절' AND name = '전기장판';

UPDATE products SET aliases = ARRAY['온수매트', '온열매트']
WHERE category = '계절' AND name = '온수매트';

UPDATE products SET aliases = ARRAY['석유히터', '석유난로', '기름난로']
WHERE category = '계절' AND name ILIKE '%히터(석유)%';

UPDATE products SET aliases = ARRAY['전기난로', '전기히터계절']
WHERE category = '계절' AND name ILIKE '%난로(전기)%';

-- ── 기타 ──
UPDATE products SET aliases = ARRAY['전신거울', '스탠드거울', '큰거울', '대형거울']
WHERE category = '기타' AND name ILIKE '%거울(전신)%';

UPDATE products SET aliases = ARRAY['대형액자', '그림액자']
WHERE category = '기타' AND name ILIKE '%액자(대형)%';

UPDATE products SET aliases = ARRAY['대형화분', '나무화분', '큰화분']
WHERE category = '기타' AND name ILIKE '%화분(대형)%';

UPDATE products SET aliases = ARRAY['빨래건조대', '접이식건조대']
WHERE category = '기타' AND name = '빨래건조대';

-- ── 모니터 ──
UPDATE products SET aliases = ARRAY['24인치모니터', '소형모니터']
WHERE item_group = '모니터' AND name ILIKE '%24%';

UPDATE products SET aliases = ARRAY['27인치모니터', '대형모니터']
WHERE item_group = '모니터' AND name ILIKE '%27%';

-- ── 프린터 ──
UPDATE products SET aliases = ARRAY['소형프린터', '잉크젯프린터']
WHERE item_group = '프린터' AND name ILIKE '%소형%';

UPDATE products SET aliases = ARRAY['복합기', '복합기프린터', '대형프린터']
WHERE item_group = '프린터' AND name ILIKE '%복합기%';

-- ── 컴퓨터 ──
UPDATE products SET aliases = ARRAY['데스크탑', 'PC본체', '컴퓨터']
WHERE category = '가전' AND name = '컴퓨터 본체';

-- ── 스피커 ──
UPDATE products SET aliases = ARRAY['소형스피커', '블루투스스피커']
WHERE item_group = '스피커' AND name ILIKE '%소형%';

UPDATE products SET aliases = ARRAY['대형스피커', '오디오스피커']
WHERE item_group = '스피커' AND name ILIKE '%대형%';

UPDATE products SET aliases = ARRAY['사운드바', 'TV스피커']
WHERE category = '가전' AND name = '사운드바';

-- ── 빔프로젝터 / 스크린 ──
UPDATE products SET aliases = ARRAY['빔프로젝트', '프로젝터', '빔']
WHERE category = '가전' AND name = '빔프로젝터';

UPDATE products SET aliases = ARRAY['프로젝터스크린', '빔스크린']
WHERE category = '가전' AND name ILIKE '%스크린%';

-- ── 욕실 ──
UPDATE products SET aliases = ARRAY['분리형욕조', '독립형욕조']
WHERE category = '욕실' AND name ILIKE '%분리형%';

UPDATE products SET aliases = ARRAY['일체형욕조', '붙박이욕조']
WHERE category = '욕실' AND name ILIKE '%일체형%';


-- ============================================================
-- Step 4: 동의어 충돌 검증 쿼리 (실행 후 결과 확인!)
-- ============================================================
-- 이 쿼리 결과가 0행이면 충돌 없음. 행이 있으면 해당 동의어 수정 필요.

SELECT alias_value, COUNT(*) as product_count,
  ARRAY_AGG(category || ' - ' || name) as products
FROM products, UNNEST(aliases) AS alias_value
WHERE aliases IS NOT NULL AND ARRAY_LENGTH(aliases, 1) > 0
GROUP BY alias_value
HAVING COUNT(*) > 1
ORDER BY product_count DESC;

-- 전체 매핑 확인
-- SELECT item_group, category, name, aliases FROM products ORDER BY item_group, category, name;
-- SELECT DISTINCT item_group FROM products ORDER BY item_group;
