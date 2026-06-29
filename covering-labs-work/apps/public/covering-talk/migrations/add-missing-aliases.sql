-- ============================================================
-- 누락 품목 aliases 추가
-- 서랍장(와이드), 화장대, 신발장, 거실장, 장식장, 캐비닛,
-- 테이블, 탁자, 욕실(세면대/수전/비데/욕실장)
-- Supabase SQL Editor에서 실행
-- ============================================================

-- ── 서랍장 (와이드 추가) ──
UPDATE products SET aliases = ARRAY['와이드서랍장', '넓은서랍장', '긴서랍장', '가로서랍장']
WHERE category = '서랍장' AND name ILIKE '%와이드%';

-- ── 화장대 ──
UPDATE products SET aliases = ARRAY['기본화장대', '일반화장대', '소형화장대', '작은화장대', '미니화장대']
WHERE category = '화장대' AND name ILIKE '%기본사이즈%';

UPDATE products SET aliases = ARRAY['중형화장대', '중간화장대']
WHERE category = '화장대' AND name ILIKE '%가정용(중)%';

UPDATE products SET aliases = ARRAY['대형화장대', '큰화장대']
WHERE category = '화장대' AND name ILIKE '%가정용(대)%';

UPDATE products SET aliases = ARRAY['스탠딩화장대', '전신거울화장대', '전신화장대']
WHERE category = '화장대' AND name ILIKE '%스탠딩%';

-- ── 신발장 ──
UPDATE products SET aliases = ARRAY['소형신발장', '작은신발장', '미니신발장', '일반신발장']
WHERE category = '신발장' AND name ILIKE '%1m이하%';

UPDATE products SET aliases = ARRAY['대형신발장', '큰신발장']
WHERE category = '신발장' AND name ILIKE '%1m이상%';

UPDATE products SET aliases = ARRAY['슬라이딩신발장', '슬라이드신발장']
WHERE category = '신발장' AND name ILIKE '%슬라이딩%';

UPDATE products SET aliases = ARRAY['현관수납장', '현관장', '현관신발장']
WHERE category = '신발장' AND name ILIKE '%현관수납장%';

-- ── 거실장 ──
UPDATE products SET aliases = ARRAY['TV받침대', 'TV다이', 'TV장', 'TV대', '거실장원목', 'TV받침대원목']
WHERE category = '거실장' AND name ILIKE '%TV받침대%' AND name ILIKE '%원목%';

UPDATE products SET aliases = ARRAY['대리석TV장', '대리석TV다이', '대리석거실장', 'TV받침대대리석']
WHERE category = '거실장' AND name ILIKE '%TV받침대%' AND name ILIKE '%대리석%';

UPDATE products SET aliases = ARRAY['TV거치대', 'TV스탠드', 'TV스탠드거치대']
WHERE category = '거실장' AND name ILIKE '%TV거치대%';

UPDATE products SET aliases = ARRAY['벽걸이장', '벽걸이수납장', '벽장']
WHERE category = '거실장' AND name ILIKE '%벽걸이장%';

-- ── 장식장 ──
UPDATE products SET aliases = ARRAY['소형장식장', '작은장식장', '미니장식장', '1m장식장']
WHERE category = '장식장' AND name ILIKE '%1m이내%';

UPDATE products SET aliases = ARRAY['중형장식장', '2m장식장']
WHERE category = '장식장' AND name ILIKE '%2m이내%';

UPDATE products SET aliases = ARRAY['대형장식장', '큰장식장']
WHERE category = '장식장' AND name ILIKE '%2m이상%';

UPDATE products SET aliases = ARRAY['유리장식장', '유리진열장', '유리장']
WHERE category = '장식장' AND name ILIKE '%유리%';

-- ── 캐비닛 ──
UPDATE products SET aliases = ARRAY['대형캐비닛', '큰캐비닛', '2m캐비닛']
WHERE category = '캐비닛' AND name ILIKE '%2m이하%';

UPDATE products SET aliases = ARRAY['서랍형캐비닛', '서랍캐비닛', '소형캐비닛', '작은캐비닛']
WHERE category = '캐비닛' AND name ILIKE '%서랍형%';

UPDATE products SET aliases = ARRAY['사무용캐비닛', '사무캐비닛', '오피스캐비닛']
WHERE category = '캐비닛' AND name ILIKE '%사무용%';

-- ── 테이블 ──
UPDATE products SET aliases = ARRAY['거실테이블', '거실탁자', '소파테이블원목', '원목거실테이블']
WHERE category = '테이블' AND name ILIKE '%거실%' AND name ILIKE '%원목%';

UPDATE products SET aliases = ARRAY['대리석거실테이블', '대리석테이블', '소파테이블대리석']
WHERE category = '테이블' AND name ILIKE '%거실%' AND name ILIKE '%대리석%';

UPDATE products SET aliases = ARRAY['사이드테이블', '소형테이블', '미니테이블', '보조테이블', '협탁테이블']
WHERE category = '테이블' AND name ILIKE '%사이드%';

UPDATE products SET aliases = ARRAY['콘솔테이블', '콘솔', '현관테이블']
WHERE category = '테이블' AND name ILIKE '%콘솔%';

UPDATE products SET aliases = ARRAY['접이식테이블', '접이식탁자', '폴딩테이블']
WHERE category = '테이블' AND name ILIKE '%접이식%';

UPDATE products SET aliases = ARRAY['바테이블', '홈바테이블', '카페테이블', '높은테이블']
WHERE category = '테이블' AND name ILIKE '%바테이블%';

-- ── 탁자 ──
UPDATE products SET aliases = ARRAY['대형회의탁자', '대형회의테이블', '10인회의테이블', '대회의실테이블']
WHERE category = '탁자' AND name ILIKE '%10인이상%';

UPDATE products SET aliases = ARRAY['소형회의탁자', '소형회의테이블', '회의테이블', '회의탁자', '미팅테이블']
WHERE category = '탁자' AND name ILIKE '%10인이하%';

UPDATE products SET aliases = ARRAY['사무용책상', '사무책상', '오피스책상', '업무책상']
WHERE category = '탁자' AND name ILIKE '%사무용%';

-- ── 욕실 (추가 품목) ──
UPDATE products SET aliases = ARRAY['세면대', '세면기', '세면볼']
WHERE category = '욕실' AND name ILIKE '%세면대%';

UPDATE products SET aliases = ARRAY['수전', '수도꼭지', '수전교체']
WHERE category = '욕실' AND name ILIKE '%수전%';

UPDATE products SET aliases = ARRAY['비데', '비데기', '전자비데']
WHERE category = '욕실' AND name ILIKE '%비데%';

UPDATE products SET aliases = ARRAY['욕실장', '욕실수납장', '화장실수납장', '화장실장']
WHERE category = '욕실' AND name ILIKE '%욕실장%';


-- ============================================================
-- 동의어 충돌 검증 (새로 추가된 것 포함)
-- ============================================================
SELECT alias_value, COUNT(*) as product_count,
  ARRAY_AGG(category || ' - ' || name) as products
FROM products, UNNEST(aliases) AS alias_value
WHERE aliases IS NOT NULL AND ARRAY_LENGTH(aliases, 1) > 0
GROUP BY alias_value
HAVING COUNT(*) > 1
ORDER BY product_count DESC;
