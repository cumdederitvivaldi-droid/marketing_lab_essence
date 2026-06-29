import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BASE = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? 'v21.0'}`
const FETCH_TIMEOUT_MS = 8_000

function resolveToken(req: NextRequest): string {
  return process.env.FACEBOOK_ACCESS_TOKEN || req.headers.get('x-fb-token') || ''
}

export async function GET(req: NextRequest) {
  const token = resolveToken(req)
  if (!token) return NextResponse.json({ error: '액세스 토큰이 없습니다' }, { status: 401 })

  const campaignId = req.nextUrl.searchParams.get('campaignId') ?? ''
  if (!campaignId) return NextResponse.json({ error: 'campaignId가 필요합니다' }, { status: 400 })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(
      `${BASE}/${campaignId}/adsets?fields=id,name,status,daily_budget,targeting,promoted_object,created_time&limit=50`,
      { cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
    )
    clearTimeout(timer)
    const data = await res.json()
    if (data.error) {
      console.error('[adsets] upstream error:', data.error)
      return NextResponse.json({ error: '업스트림 오류가 발생했습니다' }, { status: res.status })
    }

    const items = (data.data ?? [])
      .filter((a: Adset) => a.status === 'ACTIVE' || a.status === 'PAUSED')
      .sort((a: Adset, b: Adset) => (b.created_time ?? '').localeCompare(a.created_time ?? ''))

    return NextResponse.json({ data: items })
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof Error && e.name === 'AbortError') {
      return NextResponse.json({ error: '요청 시간이 초과됐습니다' }, { status: 504 })
    }
    console.error('[adsets] fetch error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface Adset {
  id: string
  name: string
  status: string
  daily_budget?: string
  targeting?: Record<string, unknown>
  created_time?: string
}
