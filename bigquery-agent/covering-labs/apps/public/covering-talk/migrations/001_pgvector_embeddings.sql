-- Voyage AI 임베딩 기반 품목 인식을 위한 pgvector 설정
-- Supabase Dashboard > SQL Editor에서 실행

-- 1) pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector
  WITH SCHEMA extensions;

-- 2) products 테이블에 임베딩 컬럼 추가
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS embedding vector(1024),
  ADD COLUMN IF NOT EXISTS embedding_text text;

-- 3) 코사인 유사도 검색 RPC 함수 (Top N 반환)
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
  SELECT
    p.id,
    p.item_group,
    p.name,
    p.category,
    p.display_name,
    p.unit_price AS base_price,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM products p
  WHERE p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 4) HNSW 인덱스 (코사인 유사도 최적화)
CREATE INDEX IF NOT EXISTS products_embedding_idx
  ON products
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
