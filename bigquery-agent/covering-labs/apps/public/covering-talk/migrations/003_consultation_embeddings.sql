-- 커버링 AI 상담 추천 시스템 — 상담 Q&A 임베딩 테이블
-- 방문수거(product_embeddings)와 완전 분리된 별도 테이블
--
-- Supabase Dashboard > SQL Editor에서 실행

-- 1) consultation_embeddings 테이블 생성
CREATE TABLE IF NOT EXISTS consultation_embeddings (
  id bigserial PRIMARY KEY,
  chat_id text NOT NULL,
  question_text text NOT NULL,
  answer_text text NOT NULL,
  tag text,
  category text,
  embedding vector(1024) NOT NULL,
  manager_name text,
  chat_created_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2) 인덱스
CREATE INDEX IF NOT EXISTS consultation_emb_tag_idx
  ON consultation_embeddings(tag);

CREATE INDEX IF NOT EXISTS consultation_emb_cat_idx
  ON consultation_embeddings(category);

CREATE INDEX IF NOT EXISTS consultation_emb_chat_id_idx
  ON consultation_embeddings(chat_id);

CREATE INDEX IF NOT EXISTS consultation_emb_vec_idx
  ON consultation_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3) 코사인 유사도 검색 RPC
CREATE OR REPLACE FUNCTION match_consultations(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 20,
  filter_tag text DEFAULT NULL,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  chat_id text,
  question_text text,
  answer_text text,
  tag text,
  category text,
  manager_name text,
  similarity float,
  chat_created_at timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ce.id,
    ce.chat_id,
    ce.question_text,
    ce.answer_text,
    ce.tag,
    ce.category,
    ce.manager_name,
    1 - (ce.embedding <=> query_embedding) AS similarity,
    ce.chat_created_at
  FROM consultation_embeddings ce
  WHERE 1 - (ce.embedding <=> query_embedding) > match_threshold
    AND (filter_tag IS NULL OR ce.tag = filter_tag)
    AND (filter_category IS NULL OR ce.category = filter_category)
  ORDER BY ce.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;
