import { NextRequest } from 'next/server'
import { readFile, rm } from 'fs/promises'
import { join, basename, resolve, sep } from 'path'
import os from 'os'
import cfg from '@/config.json'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const maxDuration = 600

const BASE = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? 'v21.0'}`
const ACCOUNT = cfg.account_id

const VIDEO_EXTS = new Set(['.mp4', '.mov'])
const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

function ext(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

async function apiFetch(
  method: 'GET' | 'POST',
  path: string,
  token: string,
  body?: Record<string, unknown> | FormData,
): Promise<Record<string, unknown>> {
  const url = `${BASE}/${path}`
  const authHeader = { Authorization: `Bearer ${token}` }
  let res: Response
  if (method === 'GET') {
    const params = new URLSearchParams(body as Record<string, string> ?? {})
    res = await fetch(`${url}?${params}`, { cache: 'no-store', headers: authHeader })
  } else {
    if (body instanceof FormData) {
      res = await fetch(url, { method: 'POST', body, cache: 'no-store', headers: authHeader })
    } else {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(body ?? {}),
        cache: 'no-store',
      })
    }
  }
  const d = await res.json() as Record<string, unknown>
  if (d.error) {
    const e = d.error as Record<string, unknown>
    throw new Error(
      [
        `API 오류 [${path}]`,
        `메시지: ${e.message ?? '알 수 없는 오류'}`,
        e.error_user_title ? `제목: ${e.error_user_title}` : null,
        e.error_user_msg ? `설명: ${e.error_user_msg}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }
  return d
}

function buildTargeting(
  osKey: string,
  targetingKey: string,
  audienceIds: string[],
): Record<string, unknown> {
  const tpl = (cfg.targeting_templates as Record<string, Record<string, unknown>>)[targetingKey] ?? {}
  const base = cfg.default_adset
  const osCfg = (cfg.apps as Record<string, Record<string, unknown>>)[osKey] ?? {}

  const t: Record<string, unknown> = {
    age_min: base.age_min,
    age_max: base.age_max,
    geo_locations: tpl.geo_locations ?? { countries: ['KR'] },
  }

  if (osCfg.user_os) {
    t.user_os = osCfg.user_os
    t.user_device = osCfg.user_device
  }
  if (targetingKey === 'all') {
    t.app_install_state = 'not_installed'
    if (tpl.excluded_geo_locations) t.excluded_geo_locations = tpl.excluded_geo_locations
    if (tpl.excluded_custom_audiences) t.excluded_custom_audiences = tpl.excluded_custom_audiences
  }
  if (targetingKey === 're' || targetingKey === 'lookalike') {
    if (!audienceIds.length) throw new Error(`타겟팅 '${targetingKey}'에는 audience_ids가 필요합니다`)
    t.custom_audiences = audienceIds.map(id => ({ id }))
  }

  if (osKey === 'ios') {
    t.publisher_platforms = ['instagram']
    t.instagram_positions = ['stream', 'story', 'reels', 'explore']
  } else {
    t.publisher_platforms = ['facebook', 'instagram']
    t.facebook_positions = ['feed', 'story']
    t.instagram_positions = ['stream', 'story', 'reels', 'explore']
  }
  return t
}

function applyOsPlacements(
  targeting: Record<string, unknown>,
  osKey: string,
): Record<string, unknown> {
  const PLACEMENT_KEYS = [
    'publisher_platforms', 'facebook_positions', 'instagram_positions',
    'messenger_positions', 'audience_network_positions', 'user_os', 'user_device',
  ]
  const t = { ...targeting }
  for (const k of PLACEMENT_KEYS) delete t[k]

  const osCfg = (cfg.apps as Record<string, Record<string, unknown>>)[osKey] ?? {}
  if (osCfg.user_os) {
    t.user_os = osCfg.user_os
    t.user_device = osCfg.user_device
  }
  if (osKey === 'ios') {
    t.publisher_platforms = ['instagram']
    t.instagram_positions = ['stream', 'story', 'reels', 'explore']
  } else {
    t.publisher_platforms = ['facebook', 'instagram']
    t.facebook_positions = ['feed', 'story']
    t.instagram_positions = ['stream', 'story', 'reels', 'explore']
  }
  return t
}

interface CreateParams {
  dryRun: boolean
  token: string
  osKey: string
  campaignId: string
  adsetName: string
  targetingKey: string
  audienceIds: string[]
  budget: number
  isCbo: boolean
  adNames: string[]
  title: string
  message: string
  savedAudienceTargeting: Record<string, unknown> | null
  sessionId?: string
  fileNames?: string[]
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      const log = (msg: string) => send({ type: 'log', msg })

      let params: CreateParams
      let files: File[]
      let sessionFilePaths: string[] | null = null

      try {
        const form = await req.formData()
        params = JSON.parse(form.get('params') as string) as CreateParams
        if (params.sessionId && params.fileNames?.length) {
          if (!UUID_RE.test(params.sessionId)) throw new Error('잘못된 sessionId')
          const sDir = join(os.tmpdir(), 'meta-upload', params.sessionId)
          const resolvedSDir = resolve(sDir)
          sessionFilePaths = params.fileNames.map(name => {
            const safe = basename(name)
            if (!safe || safe === '.' || safe === '..') throw new Error(`잘못된 파일명: ${name}`)
            const full = resolve(resolvedSDir, safe)
            if (!full.startsWith(resolvedSDir + sep)) throw new Error(`경로 탈출 시도: ${name}`)
            return full
          })
          files = []
        } else {
          files = form.getAll('files') as File[]
        }
      } catch (e) {
        send({ type: 'error', msg: `요청 파싱 실패: ${String(e)}` })
        controller.close()
        return
      }

      const token = process.env.FACEBOOK_ACCESS_TOKEN || params.token || ''
      if (!token) {
        send({ type: 'error', msg: '액세스 토큰이 없습니다' })
        controller.close()
        return
      }

      const { dryRun, osKey, campaignId, adsetName, targetingKey, audienceIds, budget, adNames, title, message, savedAudienceTargeting } = params
      let { isCbo } = params
      const osCfg = (cfg.apps as Record<string, Record<string, unknown>>)[osKey] ?? {}
      const base = cfg.default_adset

      try {
        // CBO 재확인
        if (!dryRun) {
          log('CBO 여부 확인 중...')
          try {
            const rc = await apiFetch('GET', campaignId, token, { fields: 'budget_rebalance_flag' })
            isCbo = Boolean(rc.budget_rebalance_flag)
          } catch {
            log('⚠️ CBO 재확인 실패 — 이전 값 사용')
          }
        }

        // 타겟팅 빌드
        let targeting: Record<string, unknown>
        if (savedAudienceTargeting) {
          targeting = applyOsPlacements(savedAudienceTargeting, osKey)
          if (audienceIds.length) {
            targeting.custom_audiences = audienceIds.map(id => ({ id }))
          }
        } else {
          targeting = buildTargeting(osKey, targetingKey, audienceIds)
        }

        // 광고세트 생성
        log(`광고세트 생성 중: ${adsetName}`)
        const promoted: Record<string, unknown> = {
          application_id: osCfg.application_id,
          object_store_url: osCfg.store_url,
          smart_pse_enabled: false,
        }
        if (osCfg.custom_event_type) promoted.custom_event_type = osCfg.custom_event_type

        const adsetPayload: Record<string, unknown> = {
          name: adsetName,
          campaign_id: campaignId,
          status: 'PAUSED',
          billing_event: base.billing_event,
          optimization_goal: osCfg.optimization_goal,
          bid_strategy: base.bid_strategy,
          promoted_object: promoted,
          targeting,
        }
        if (!isCbo) adsetPayload.daily_budget = String(budget)
        else log('ℹ️ CBO 캠페인 — 세트 예산 미설정')

        let adsetId: string
        if (dryRun) {
          adsetId = 'DRY_ADSET_ID'
          log(`[미리보기] 광고세트 ID: ${adsetId}`)
        } else {
          const r = await apiFetch('POST', `${ACCOUNT}/adsets`, token, adsetPayload)
          adsetId = r.id as string
          log(`✅ 광고세트 ID: ${adsetId}`)
        }

        const results: Array<Record<string, unknown>> = []
        const advOff = JSON.stringify({
          creative_features_spec: {
            adapt_to_placement: { enroll_status: 'OPT_OUT' },
          },
        })

        const fileCount = sessionFilePaths ? sessionFilePaths.length : files.length
        for (let i = 0; i < fileCount; i++) {
          const fileFallbackName = sessionFilePaths ? basename(sessionFilePaths[i]) : (files[i]?.name ?? '')
          try {
            const file: File = sessionFilePaths
              ? new File([await readFile(sessionFilePaths[i])], basename(sessionFilePaths[i]))
              : files[i]
            const fileExt = ext(file.name)
            const adNm = adNames[i] ?? file.name.replace(/\.[^.]+$/, '')
            log(`\n[${i + 1}/${fileCount}] ${file.name}  →  광고명: ${adNm}`)

            const storeUrl = osCfg.store_url as string
            let storySpec: Record<string, unknown>

            if (VIDEO_EXTS.has(fileExt)) {
              log('  영상 업로드 중...')
              let assetId: string
              let thumbUrl: string | undefined

              if (!dryRun) {
                const buf = await file.arrayBuffer()
                const fileSize = buf.byteLength

                const startRes = await apiFetch('POST', `${ACCOUNT}/advideos`, token, {
                  upload_phase: 'start',
                  file_size: String(fileSize),
                  name: file.name,
                })
                const sessionId = startRes.upload_session_id as string
                const videoId = startRes.video_id as string
                let startOffset = Number(startRes.start_offset)
                let endOffset = Number(startRes.end_offset)

                const bytes = new Uint8Array(buf)
                let chunkNum = 0
                while (startOffset < fileSize) {
                  const chunk = bytes.slice(startOffset, endOffset)
                  chunkNum++
                  log(`  청크 ${chunkNum}: ${(startOffset / 1024 / 1024).toFixed(1)} / ${(fileSize / 1024 / 1024).toFixed(1)} MB`)

                  const chunkForm = new FormData()
                  chunkForm.append('upload_phase', 'transfer')
                  chunkForm.append('upload_session_id', sessionId)
                  chunkForm.append('start_offset', String(startOffset))
                  chunkForm.append('video_file_chunk', new Blob([chunk], { type: 'application/octet-stream' }), file.name)

                  const r2 = await apiFetch('POST', `${ACCOUNT}/advideos`, token, chunkForm)
                  startOffset = Number(r2.start_offset)
                  endOffset = Number(r2.end_offset)
                  await new Promise(r => setTimeout(r, 300))
                }

                await apiFetch('POST', `${ACCOUNT}/advideos`, token, {
                  upload_phase: 'finish',
                  upload_session_id: sessionId,
                })
                log(`  ✅ 업로드 완료  video_id: ${videoId}`)

                log('  영상 처리 대기 중 (최대 10분)...')
                const deadline = Date.now() + 600_000
                let videoReady = false
                while (Date.now() < deadline) {
                  const rst = await apiFetch('GET', videoId, token, { fields: 'status' })
                  const vst = rst.status as Record<string, unknown>
                  const vstatus = (vst?.video_status ?? 'processing') as string
                  const prog = vst?.processing_progress ?? 0
                  log(`  처리 중 ${prog}%  (${vstatus})`)
                  if (vstatus === 'ready') { log('  ✅ 영상 처리 완료'); videoReady = true; break }
                  if (vstatus === 'error') throw new Error(`영상 처리 실패: ${JSON.stringify(vst)}`)
                  await new Promise(r => setTimeout(r, 15_000))
                }
                if (!videoReady) throw new Error('영상 처리 시간 초과 (10분)')

                const rth = await apiFetch('GET', videoId, token, { fields: 'thumbnails' })
                const thumbs = (rth.thumbnails as { data: Array<{ uri: string; is_preferred?: boolean }> })?.data ?? []
                thumbUrl = thumbs.find(t => t.is_preferred)?.uri
                assetId = videoId
              } else {
                assetId = 'DRY_VIDEO_ID'
              }

              const videoData: Record<string, unknown> = {
                video_id: assetId,
                title,
                message,
                call_to_action: {
                  type: cfg.default_creative.call_to_action_type,
                  value: { link: storeUrl },
                },
              }
              if (thumbUrl) videoData.image_url = thumbUrl

              storySpec = {
                page_id: cfg.page_id,
                instagram_user_id: cfg.instagram_user_id,
                video_data: videoData,
              }
            } else {
              log('  이미지 업로드 중...')
              let imageHash: string

              if (!dryRun) {
                const mime = IMAGE_MIME[fileExt] ?? 'image/jpeg'
                const imgForm = new FormData()
                const buf = await file.arrayBuffer()
                imgForm.append('filename', new Blob([buf], { type: mime }), file.name)

                const rImg = await apiFetch('POST', `${ACCOUNT}/adimages`, token, imgForm)
                const images = rImg.images as Record<string, { hash: string }>
                imageHash = Object.values(images)[0]?.hash ?? ''
                log(`  ✅ 이미지 업로드 완료  hash: ${imageHash}`)
              } else {
                imageHash = 'DRY_IMAGE_HASH'
              }

              storySpec = {
                page_id: cfg.page_id,
                instagram_user_id: cfg.instagram_user_id,
                link_data: {
                  image_hash: imageHash,
                  name: title,
                  message,
                  link: storeUrl,
                  call_to_action: {
                    type: cfg.default_creative.call_to_action_type,
                    value: { link: storeUrl },
                  },
                },
              }
            }

            log('  소재 생성 중...')
            let creativeId: string
            if (dryRun) {
              creativeId = 'DRY_CREATIVE_ID'
            } else {
              const rcr = await apiFetch('POST', `${ACCOUNT}/adcreatives`, token, {
                name: `[AUTO] ${adNm}`,
                object_story_spec: JSON.stringify(storySpec),
                degrees_of_freedom_spec: advOff,
              })
              creativeId = rcr.id as string
            }
            log(`  ✅ 소재 ID: ${creativeId}`)

            let adId: string
            if (dryRun) {
              adId = 'DRY_AD_ID'
            } else {
              const rad = await apiFetch('POST', `${ACCOUNT}/ads`, token, {
                name: adNm,
                adset_id: adsetId,
                creative: { creative_id: creativeId },
                status: 'PAUSED',
              })
              adId = rad.id as string
            }
            log(`  ✅ 광고 ID: ${adId}`)

            results.push({ file: file.name, adName: adNm, adId, status: 'ok' })
          } catch (e) {
            log(`  ❌ 오류: ${String(e)}`)
            results.push({ file: fileFallbackName, adName: adNames[i] ?? '', status: 'error', error: String(e) })
          }

          await new Promise(r => setTimeout(r, 500))
        }

        send({ type: 'done', adsetId, results, dryRun })
      } catch (e) {
        send({ type: 'error', msg: String(e) })
      } finally {
        if (sessionFilePaths && params.sessionId) {
          await rm(join(os.tmpdir(), 'meta-upload', params.sessionId), { recursive: true, force: true }).catch(() => {})
        }
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
