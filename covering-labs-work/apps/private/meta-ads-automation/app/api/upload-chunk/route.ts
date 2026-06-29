import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readdir, readFile, unlink, rmdir, rm } from 'fs/promises'
import { join, basename, resolve, sep } from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sessionDir(sessionId: string): string {
  return join(os.tmpdir(), 'meta-upload', sessionId)
}

function safePath(base: string, name: string): string | null {
  const safe = basename(name)
  if (!safe || safe === '.' || safe === '..') return null
  const resolvedBase = resolve(base)
  const full = resolve(resolvedBase, safe)
  if (!full.startsWith(resolvedBase + sep)) return null
  return full
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const sessionId = form.get('sessionId') as string
    const fileName  = form.get('fileName')  as string
    const chunkIndex  = Number(form.get('chunkIndex'))
    const totalChunks = Number(form.get('totalChunks'))
    const chunk = form.get('chunk') as File | null

    if (
      !sessionId ||
      !fileName ||
      !Number.isInteger(chunkIndex) ||
      !Number.isInteger(totalChunks) ||
      totalChunks <= 0 ||
      chunkIndex < 0 ||
      chunkIndex >= totalChunks ||
      !chunk
    ) {
      return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 })
    }
    if (!UUID_RE.test(sessionId)) {
      return NextResponse.json({ error: '잘못된 sessionId' }, { status: 400 })
    }

    const sDir = sessionDir(sessionId)
    const filePath = safePath(sDir, fileName)
    if (!filePath) {
      return NextResponse.json({ error: '잘못된 파일명' }, { status: 400 })
    }
    const safeName = basename(filePath)

    const chunkDir = join(sDir, safeName + '.chunks')
    await mkdir(chunkDir, { recursive: true })

    const chunkPath = join(chunkDir, String(chunkIndex).padStart(6, '0'))
    await writeFile(chunkPath, Buffer.from(await chunk.arrayBuffer()))

    if (chunkIndex === totalChunks - 1) {
      const chunkFiles = (await readdir(chunkDir)).sort()
      const expected = Array.from({ length: totalChunks }, (_, i) => String(i).padStart(6, '0'))
      if (chunkFiles.length !== totalChunks || chunkFiles.some((f, i) => f !== expected[i])) {
        await rm(chunkDir, { recursive: true, force: true }).catch(() => {})
        return NextResponse.json({ error: '청크가 모두 도착하지 않았습니다' }, { status: 409 })
      }
      const parts = await Promise.all(chunkFiles.map(f => readFile(join(chunkDir, f))))
      const assembled = Buffer.concat(parts)
      await writeFile(filePath, assembled)
      for (const f of chunkFiles) await unlink(join(chunkDir, f))
      await rmdir(chunkDir)
      return NextResponse.json({ done: true })
    }

    return NextResponse.json({ done: false, chunkIndex })
  } catch (e) {
    console.error('[upload-chunk] error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
