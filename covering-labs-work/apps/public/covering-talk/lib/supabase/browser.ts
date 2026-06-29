"use client";

import { createClient } from "@supabase/supabase-js";

/** 브라우저에서 Supabase Realtime 등에 사용하는 클라이언트 (NEXT_PUBLIC_ 환경변수) */
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"
);
