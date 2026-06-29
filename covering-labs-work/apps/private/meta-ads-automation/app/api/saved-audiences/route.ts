import { NextRequest, NextResponse } from 'next/server'
import cfg from '@/config.json'

export const dynamic = 'force-dynamic'

const BASE = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? 'v21.0'}`
const FETCH_TIMEOUT_MS = 8_000

function resolveToken(req: NextRequest): string {
  return process.env.FACEBOOK_ACCESS_TOKEN || req.headers.get('x-fb-token') || ''
}

export async function GET(req: NextRequest) {
  const token = resolveToken(req)
  if (!token) return NextResponse.json({ error: '액세스 토큰이 없습니다' }, { status: 401 })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(
      `${BASE}/${cfg.account_id}/saved_audiences?fields=id,name,targeting,created_time&limit=200`,
      { cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
    )
    clearTimeout(timer)
    const data = await res.json()
    if (data.error) {
      console.error('[saved-audiences] upstream error:', data.error)
      return NextResponse.json({ error: '업스트림 오류가 발생했습니다' }, { status: res.status })
    }

    const items = (data.data ?? []).sort(
      (a: { created_time?: string }, b: { created_time?: string }) =>
        (b.created_time ?? '').localeCompare(a.created_time ?? ''),
    )

    return NextResponse.json({ data: items })
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof Error && e.name === 'AbortError') {
      return NextResponse.json({ error: '요청 시간이 초과됐습니다' }, { status: 504 })
    }
    console.error('[saved-audiences] fetch error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
