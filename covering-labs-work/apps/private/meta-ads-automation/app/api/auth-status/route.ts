import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ hasEnvToken: !!process.env.FACEBOOK_ACCESS_TOKEN })
}
