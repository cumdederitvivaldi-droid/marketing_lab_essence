-- 개별 키워드 임베딩 테이블 (product_embeddings)
-- 기존: products.embedding에 모든 키워드를 합쳐서 1개 임베딩
-- 변경: product_embeddings 테이블에 키워드별 개별 임베딩 (품목명 + 각 alias 별도)
--
-- Supabase Dashboard > SQL Editor에서 실행

-- 1) product_embeddings 테이블 생성
CREATE TABLE IF NOT EXISTS product_embeddings (
  id bigserial PRIMARY KEY,
  product_id bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2) 인덱스
CREATE INDEX IF NOT EXISTS product_embeddings_product_id_idx
  ON product_embeddings(product_id);

CREATE INDEX IF NOT EXISTS product_embeddings_embedding_idx
  ON product_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3) 코사인 유사도 검색 RPC (product_embeddings → products JOIN)
CREATE OR REPLACE FUNCTION match_products(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id bigint,
  item_group text,
  name text,
  category text,
  display_name text,
  base_price bigint,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (p.id)
    p.id,
    p.item_group,
    p.name,
    p.category,
    p.display_name,
    p.unit_price AS base_price,
    1 - (pe.embedding <=> query_embedding) AS similarity
  FROM product_embeddings pe
  JOIN products p ON p.id = pe.product_id
  WHERE 1 - (pe.embedding <=> query_embedding) > match_threshold
  ORDER BY p.id, pe.embedding <=> query_embedding
$$;

-- 위 쿼리는 같은 product_id에 대해 가장 높은 유사도만 반환 후,
-- 전체를 유사도 내림차순으로 정렬하여 match_count만큼 반환하는 래퍼:
CREATE OR REPLACE FUNCTION match_products(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id bigint,
  item_group text,
  name text,
  category text,
  display_name text,
  base_price bigint,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  WITH best_per_product AS (
    SELECT DISTINCT ON (p.id)
      p.id,
      p.item_group,
      p.name,
      p.category,
      p.display_name,
      p.unit_price AS base_price,
      1 - (pe.embedding <=> query_embedding) AS similarity
    FROM product_embeddings pe
    JOIN products p ON p.id = pe.product_id
    WHERE 1 - (pe.embedding <=> query_embedding) > match_threshold
    ORDER BY p.id, pe.embedding <=> query_embedding ASC
  )
  SELECT * FROM best_per_product
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- 4) (선택) 기존 products 테이블의 embedding/embedding_text 컬럼은
--    새 시스템 안정화 후 제거 가능. 지금은 유지.
-- ALTER TABLE products DROP COLUMN IF EXISTS embedding;
-- ALTER TABLE products DROP COLUMN IF EXISTS embedding_text;
