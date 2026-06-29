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

  const os = req.nextUrl.searchParams.get('os') ?? ''

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(
      `${BASE}/${cfg.account_id}/campaigns?fields=id,name,status,created_time,budget_rebalance_flag&limit=50`,
      { cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
    )
    clearTimeout(timer)
    const data = await res.json()
    if (data.error) {
      console.error('[campaigns] upstream error:', data.error)
      return NextResponse.json({ error: '업스트림 오류가 발생했습니다' }, { status: res.status })
    }

    let items: Campaign[] = (data.data ?? []).filter(
      (c: Campaign) => c.status === 'ACTIVE' || c.status === 'PAUSED',
    )
    items.sort((a, b) => (b.created_time ?? '').localeCompare(a.created_time ?? ''))

    if (os) {
      const kw = os === 'ios' ? 'ios' : 'aos'
      const filtered = items.filter(c => c.name.toLowerCase().includes(kw))
      if (filtered.length > 0) items = filtered
    }

    return NextResponse.json({ data: items })
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof Error && e.name === 'AbortError') {
      return NextResponse.json({ error: '요청 시간이 초과됐습니다' }, { status: 504 })
    }
    console.error('[campaigns] fetch error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface Campaign {
  id: string
  name: string
  status: string
  created_time?: string
  budget_rebalance_flag?: boolean
}
