-- CS 매크로 임베딩 테이블
-- 검증된 공식 답변 172개를 임베딩해서 고객 질문과 직접 매칭
--
-- Supabase Dashboard > SQL Editor에서 실행

-- 1) macro_embeddings 테이블 생성
CREATE TABLE IF NOT EXISTS macro_embeddings (
  id bigserial PRIMARY KEY,
  macro_name text NOT NULL,          -- 매크로명 (예: "1_이용방법_봉투구매방법")
  macro_category text,               -- 접두사 카테고리 (예: "1_이용방법")
  content text NOT NULL,             -- 매크로 답변 내용
  tag text,                          -- 채널톡 태그 (있는 경우)
  embedding vector(1024) NOT NULL,   -- Voyage AI 임베딩
  author text,
  updated_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2) 인덱스
CREATE INDEX IF NOT EXISTS macro_emb_cat_idx
  ON macro_embeddings(macro_category);

CREATE INDEX IF NOT EXISTS macro_emb_vec_idx
  ON macro_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3) 코사인 유사도 검색 RPC
CREATE OR REPLACE FUNCTION match_macros(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
) RETURNS TABLE (
  id bigint,
  macro_name text,
  macro_category text,
  content text,
  tag text,
  similarity float
) LANGUAGE sql STABLE AS $$
  SELECT
    me.id,
    me.macro_name,
    me.macro_category,
    me.content,
    me.tag,
    1 - (me.embedding <=> query_embedding) AS similarity
  FROM macro_embeddings me
  WHERE 1 - (me.embedding <=> query_embedding) > match_threshold
  ORDER BY me.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;
