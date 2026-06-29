'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Megaphone, Smartphone, Monitor, ChevronDown, Upload, Play, Eye,
  CheckCircle, AlertCircle, Info, Loader2, Save, RotateCcw,
} from 'lucide-react'
import { validateAdsetName } from '@/lib/validation'

// ── 타입 ──────────────────────────────────────────────────────────
interface Campaign {
  id: string
  name: string
  status: 'ACTIVE' | 'PAUSED'
  created_time?: string
  budget_rebalance_flag?: boolean
}

interface Adset {
  id: string
  name: string
  status: 'ACTIVE' | 'PAUSED'
  daily_budget?: string
  targeting?: Record<string, unknown>
  created_time?: string
}

interface SavedAudience {
  id: string
  name: string
  targeting?: Record<string, unknown>
  created_time?: string
}

interface AdResult {
  file: string
  adName: string
  adId?: string
  status: 'ok' | 'error'
  error?: string
}

// ── 상수 ──────────────────────────────────────────────────────────
const DEFAULT_MESSAGE =
  '커버링만 있으면 1분안에 청소 \n\n비밀 할인코드 : BIMIL20\n◾내 정보> 쿠폰> 쿠폰 코드 입력하기에 입력하면 끝!\n\n[이용 가능 지역 안내]\n서울, 고양(일부), 남양주(일부), 구리, 인천(일부), 부천, 하남(일부), 광명, 안양, 성남, 군포, 안산, 시흥, 수원, 용인(기흥구·수지구), 의왕, 화성(동탄), 오산, 평택(일부), 과천, 김포, 의정부, 경기도 광주, 안성시, 파주시, 천안, 아산, 대전, 세종, 청주\n*일부 지역은 서비스 제한구역이 있습니다\n\n인근 지역은 서비스 확장 준비 중이니 조금만 기다려주세요🫡'

const ADSET_NAMING_RULE = [
  { num: 1, field: 'OS', values: 'aos / ios' },
  { num: 2, field: '세트목표', values: 'purchase / install / registration' },
  { num: 3, field: '세팅_타겟', values: 'all / re / lookalike' },
  { num: 4, field: '지역코드', values: 'cr / cna / asn / dcj' },
  { num: 5, field: '콘텐츠_형식', values: 'vd / im / slide / all' },
  { num: 6, field: '컨셉(후킹)', values: '이사워킹맘(대형폐기물)' },
  { num: 7, field: '담당자+버전', values: 'mk1 / sj1' },
  { num: 8, field: '날짜', values: 'YY.MM.DD' },
]

// ── 헬퍼 ──────────────────────────────────────────────────────────
function detectTargeting(adset: Adset): { key: string; audienceIds: string[] } {
  const targeting = adset.targeting ?? {}
  const audiences = (targeting.custom_audiences as Array<{ id: string }>) ?? []
  if (!audiences.length) return { key: 'all', audienceIds: [] }
  const ids = audiences.map(a => a.id)
  return { key: targeting.lookalike_specs ? 'lookalike' : 're', audienceIds: ids }
}

function parseBudget(adset: Adset): number {
  return parseInt(adset.daily_budget ?? '30000', 10) || 30000
}

function todayStr(): string {
  const d = new Date()
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// ── 공통 UI 컴포넌트 ──────────────────────────────────────────────
function SectionCard({ step, title, children, disabled }: {
  step: number; title: string; children: React.ReactNode; disabled?: boolean
}) {
  if (disabled) return null
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-semibold">
          {step}
        </span>
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function Alert({ type, children }: { type: 'info' | 'warn' | 'error' | 'success'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warn: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  }
  const icons = { info: Info, warn: AlertCircle, error: AlertCircle, success: CheckCircle }
  const Icon = icons[type]
  return (
    <div className={`flex gap-2 items-start p-3 rounded-lg border text-sm ${styles[type]}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────
export default function Page() {
  // 토큰
  const [hasEnvToken, setHasEnvToken] = useState<boolean | null>(null)
  const [tokenInput, setTokenInput] = useState('')

  // 1단계: OS
  const [os, setOs] = useState<'aos' | 'ios' | null>(null)

  // 2단계: 캠페인
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignLoading, setCampaignLoading] = useState(false)
  const [campaignError, setCampaignError] = useState('')
  const [campaignMode, setCampaignMode] = useState<'list' | 'manual'>('list')
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [manualCampaignId, setManualCampaignId] = useState('')
  const [manualCampaignLoading, setManualCampaignLoading] = useState(false)
  const [manualCampaignError, setManualCampaignError] = useState('')

  // 3단계: 복사할 광고세트
  const [adsets, setAdsets] = useState<Adset[]>([])
  const [adsetLoading, setAdsetLoading] = useState(false)
  const [skipCopy, setSkipCopy] = useState(false)
  const [sourceAdset, setSourceAdset] = useState<Adset | null>(null)

  // 4단계: 신규 광고세트 설정
  const [adsetName, setAdsetName] = useState('')
  const [savedAudiences, setSavedAudiences] = useState<SavedAudience[]>([])
  const [selectedSavedAudience, setSelectedSavedAudience] = useState<SavedAudience | null>(null)
  const [budget, setBudget] = useState(30000)

  // 5단계: 파일
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 6단계: 광고명 + 문구
  const [adNames, setAdNames] = useState<string[]>([])
  const [adTitle, setAdTitle] = useState('커버링으로 빠르게 청소하기')
  const [adMessage, setAdMessage] = useState(DEFAULT_MESSAGE)
  const [useDefaultMsg, setUseDefaultMsg] = useState(true)

  // detectTargeting 결과 보존 (sourceAdset 복사 시)
  const [detectedAudienceIds, setDetectedAudienceIds] = useState<string[]>([])

  // 실행
  const [isDryRun, setIsDryRun] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const [resultAdsetId, setResultAdsetId] = useState('')
  const [adResults, setAdResults] = useState<AdResult[] | null>(null)
  const [runError, setRunError] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)

  // ── 토큰 상태 확인 ────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth-status')
      .then(r => r.json())
      .then(d => setHasEnvToken(d.hasEnvToken))
      .catch(() => setHasEnvToken(false))
  }, [])

  // 로컬스토리지에서 광고 문구 복원
  useEffect(() => {
    const saved = localStorage.getItem('meta_ad_message')
    if (saved) setAdMessage(saved)
  }, [])

  // 로그 자동 스크롤
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logLines])

  const token = hasEnvToken ? '' : tokenInput

  function headers(): Record<string, string> {
    return token ? { 'x-fb-token': token } : {}
  }

  // ── 2단계: 캠페인 로드 ───────────────────────────────────────
  useEffect(() => {
    if (!os) return
    if (campaignMode !== 'list') return
    setCampaignLoading(true)
    setCampaignError('')
    setSelectedCampaign(null)
    fetch(`/api/campaigns?os=${os}`, { headers: headers() })
      .then(r => r.json())
      .then(d => {
        if (d.error) setCampaignError(d.error)
        else setCampaigns(d.data ?? [])
      })
      .catch(e => setCampaignError(String(e)))
      .finally(() => setCampaignLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os, campaignMode, hasEnvToken, tokenInput])

  // ── 3단계: 광고세트 로드 ─────────────────────────────────────
  useEffect(() => {
    if (!selectedCampaign) return
    setAdsetLoading(true)
    setSourceAdset(null)
    fetch(`/api/adsets?campaignId=${selectedCampaign.id}`, { headers: headers() })
      .then(r => r.json())
      .then(d => setAdsets(d.data ?? []))
      .catch(() => setAdsets([]))
      .finally(() => setAdsetLoading(false))
    // 저장된 타겟도 로드
    fetch('/api/saved-audiences', { headers: headers() })
      .then(r => r.json())
      .then(d => setSavedAudiences(d.data ?? []))
      .catch(() => setSavedAudiences([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCampaign])

  // ── 광고세트명 기본값 ─────────────────────────────────────────
  useEffect(() => {
    if (selectedCampaign && !skipCopy && sourceAdset) {
      setAdsetName(`[사본] ${sourceAdset.name}`)
      const det = detectTargeting(sourceAdset)
      setDetectedAudienceIds(det.audienceIds)
      setBudget(parseBudget(sourceAdset))
    } else if (os && selectedCampaign) {
      setAdsetName(`${os}_purchase_all_cr_vd_컨셉(후킹)_mk1_${todayStr()}`)
      setDetectedAudienceIds([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceAdset, skipCopy, selectedCampaign, os])

  // ── 파일 변경 시 광고명 초기화 ───────────────────────────────
  useEffect(() => {
    setAdNames(files.map(f => f.name.replace(/\.[^.]+$/, '')))
  }, [files])

  // ── 수동 캠페인 조회 ─────────────────────────────────────────
  const lookupManualCampaign = useCallback(async () => {
    if (!manualCampaignId.trim()) return
    setManualCampaignLoading(true)
    setManualCampaignError('')
    try {
      const r = await fetch(`/api/campaigns?os=`, { headers: headers() })
      // 직접 Graph API 형태로 단건 조회는 별도 엔드포인트가 없으므로 목록에서 찾거나,
      // 입력값을 그대로 캠페인 ID로 사용
      const id = manualCampaignId.trim()
      setSelectedCampaign({ id, name: `(ID: ${id})`, status: 'PAUSED' })
    } catch (e) {
      setManualCampaignError(String(e))
    } finally {
      setManualCampaignLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualCampaignId, hasEnvToken, tokenInput])

  // ── 실행 ─────────────────────────────────────────────────────
  const handleRun = useCallback(async (dryRun: boolean) => {
    if (!selectedCampaign || !adsetName.trim() || !files.length) return

    const targetingKey = adsetName.split('_')[2] ?? 'all'
    const audienceIds = detectedAudienceIds

    setIsRunning(true)
    setLogLines([])
    setAdResults(null)
    setRunError('')
    setResultAdsetId('')
    setIsDryRun(dryRun)

    const CHUNK_SIZE = 800 * 1024
    const sessionId = crypto.randomUUID()

    try {
      for (const file of files) {
        const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
        for (let i = 0; i < totalChunks; i++) {
          setLogLines(prev => {
            const line = `파일 업로드 중: ${file.name} (${i + 1}/${totalChunks})`
            return [...prev.filter(l => !l.startsWith('파일 업로드 중: ' + file.name)), line]
          })
          const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
          const cf = new FormData()
          cf.append('sessionId', sessionId)
          cf.append('fileName', file.name)
          cf.append('chunkIndex', String(i))
          cf.append('totalChunks', String(totalChunks))
          cf.append('chunk', chunk, file.name)
          const cr = await fetch('/api/upload-chunk', { method: 'POST', body: cf })
          if (!cr.ok) throw new Error(`파일 업로드 실패: ${file.name}`)
        }
      }
      setLogLines(prev => [...prev.filter(l => !l.startsWith('파일 업로드 중:')), '✅ 파일 업로드 완료'])
    } catch (e) {
      setRunError(String(e))
      setIsRunning(false)
      return
    }

    const form = new FormData()
    form.append('params', JSON.stringify({
      dryRun,
      token,
      osKey: os,
      campaignId: selectedCampaign.id,
      adsetName: adsetName.trim(),
      targetingKey,
      audienceIds,
      budget,
      isCbo: selectedCampaign.budget_rebalance_flag ?? false,
      adNames: adNames.map(n => n.trim()),
      title: adTitle,
      message: useDefaultMsg ? adMessage : adMessage,
      savedAudienceTargeting: selectedSavedAudience?.targeting ?? null,
      sessionId,
      fileNames: files.map(f => f.name),
    }))

    try {
      const res = await fetch('/api/create', { method: 'POST', body: form })
      if (!res.ok) {
        const text = await res.text()
        let msg = '서버 오류가 발생했습니다'
        try { const j = JSON.parse(text); if (j.error) msg = j.error } catch {}
        setRunError(msg)
        return
      }
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('text/event-stream')) {
        const body = await res.text()
        setRunError(`예상치 못한 응답 형식 (${ct}): ${body.slice(0, 200)}`)
        return
      }
      if (!res.body) throw new Error('응답 스트림이 없습니다')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const parseEvent = (line: string) => {
        if (!line.startsWith('data: ')) return
        try {
          const event = JSON.parse(line.slice(6)) as { type: string; msg?: string; adsetId?: string; results?: AdResult[] }
          if (event.type === 'log') {
            setLogLines(prev => [...prev, event.msg ?? ''])
          } else if (event.type === 'done') {
            setResultAdsetId(event.adsetId ?? '')
            setAdResults(event.results ?? [])
          } else if (event.type === 'error') {
            setRunError(event.msg ?? '알 수 없는 오류')
          }
        } catch {}
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) parseEvent(line)
      }
      buffer += decoder.decode()
      if (buffer) parseEvent(buffer)
    } catch (e) {
      setRunError(String(e))
    } finally {
      setIsRunning(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCampaign, adsetName, files, os, budget, adNames, adTitle, adMessage, selectedSavedAudience, useDefaultMsg, token, detectedAudienceIds])

  // ── 유효성 검사 ──────────────────────────────────────────────
  const nameError = adsetName.trim() ? validateAdsetName(adsetName.trim()) : null
  const targetingKey = adsetName.split('_')[2] ?? ''
  const needsAudience = ['re', 'lookalike'].includes(targetingKey) && !selectedSavedAudience
  const finalErrors: string[] = []
  if (!adsetName.trim()) finalErrors.push('광고세트명을 입력해주세요.')
  if (needsAudience) finalErrors.push('리타겟/유사타겟 세팅에는 저장된 타겟을 선택해야 합니다.')
  if (adNames.some(n => !n.trim())) finalErrors.push('모든 광고 소재 이름을 입력해주세요.')

  const canRun = !!selectedCampaign && !!adsetName.trim() && files.length > 0 && finalErrors.length === 0

  const isCbo = selectedCampaign?.budget_rebalance_flag ?? false

  // ── 결과 JSON ────────────────────────────────────────────────
  const resultJson = adResults
    ? JSON.stringify({
        timestamp: new Date().toISOString(),
        campaignId: selectedCampaign?.id,
        campaign: selectedCampaign?.name,
        adsetId: resultAdsetId,
        adsetName: adsetName.trim(),
        os,
        results: adResults,
      }, null, 2)
    : ''

  // ══════════════════════════════════════════════════════════════
  // 렌더링
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Megaphone className="w-5 h-5 text-blue-600" />
            <h1 className="text-lg font-bold text-gray-900">커버링 Meta 광고 자동 세팅</h1>
          </div>
          <p className="text-xs text-gray-500">생성되는 모든 광고는 <span className="font-semibold">PAUSED</span> 상태입니다</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* 토큰 상태 */}
        {hasEnvToken === false && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-gray-700">Facebook Access Token</span>
            </div>
            <input
              type="password"
              placeholder="EAAFIua6..."
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {!tokenInput && (
              <p className="mt-2 text-xs text-yellow-600">토큰을 입력하면 시작됩니다.</p>
            )}
          </div>
        )}
        {hasEnvToken === true && (
          <Alert type="success">서버 환경변수에서 토큰을 자동으로 불러왔습니다.</Alert>
        )}

        {/* 1단계: OS 선택 */}
        <SectionCard step={1} title="OS 선택">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => { setOs('aos'); setSelectedCampaign(null) }}
              className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${os === 'aos' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
            >
              <Monitor className={`w-8 h-8 ${os === 'aos' ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className="font-semibold text-sm">AOS (Android)</span>
              <span className="text-xs text-gray-500">Facebook + Instagram</span>
            </button>
            <button
              onClick={() => { setOs('ios'); setSelectedCampaign(null) }}
              className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${os === 'ios' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
            >
              <Smartphone className={`w-8 h-8 ${os === 'ios' ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className="font-semibold text-sm">iOS (iPhone)</span>
              <span className="text-xs text-gray-500">Instagram 전용</span>
            </button>
          </div>
          {os && (
            <div className="mt-3">
              <Alert type="success">
                {os.toUpperCase()} 선택됨 —{' '}
                {os === 'ios' ? 'Instagram (스트림·스토리·릴스·탐색)' : 'Facebook + Instagram (피드·스토리·릴스)'}
              </Alert>
            </div>
          )}
        </SectionCard>

        {/* 2단계: 캠페인 선택 */}
        <SectionCard step={2} title="캠페인 선택" disabled={!os || (!hasEnvToken && !tokenInput)}>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={campaignMode === 'manual'}
                onChange={e => { setCampaignMode(e.target.checked ? 'manual' : 'list'); setSelectedCampaign(null) }}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">캠페인 ID 직접 입력</span>
            </label>

            {campaignMode === 'manual' ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="예: 120231883282870514"
                  value={manualCampaignId}
                  onChange={e => setManualCampaignId(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={lookupManualCampaign}
                  disabled={!manualCampaignId.trim() || manualCampaignLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
                >
                  {manualCampaignLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '확인'}
                </button>
              </div>
            ) : (
              <>
                {campaignLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />캠페인 불러오는 중...
                  </div>
                )}
                {campaignError && <Alert type="error">{campaignError}</Alert>}
                {!campaignLoading && !campaignError && campaigns.length > 0 && (
                  <div className="relative">
                    <select
                      value={selectedCampaign?.id ?? ''}
                      onChange={e => {
                        const c = campaigns.find(c => c.id === e.target.value) ?? null
                        setSelectedCampaign(c)
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                    >
                      <option value="">— 캠페인 선택 ({campaigns.length}개) —</option>
                      {campaigns.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.status === 'ACTIVE' ? '🟢' : '⏸'} {c.name}{c.budget_rebalance_flag ? ' [CBO]' : ''} | {(c.created_time ?? '').slice(0, 10)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                )}
                {!campaignLoading && !campaignError && campaigns.length === 0 && (
                  <Alert type="warn">조회된 캠페인이 없습니다. ID 직접 입력을 사용하세요.</Alert>
                )}
              </>
            )}

            {selectedCampaign && (
              <Alert type={selectedCampaign.budget_rebalance_flag ? 'info' : 'success'}>
                {selectedCampaign.budget_rebalance_flag
                  ? `📌 CBO 캠페인 — 예산은 캠페인 레벨에서 관리됩니다 (${selectedCampaign.name})`
                  : `선택됨: ${selectedCampaign.name}`}
              </Alert>
            )}
          </div>
        </SectionCard>

        {/* 3단계: 복사할 광고세트 */}
        <SectionCard step={3} title="복사할 광고세트 선택 (선택)" disabled={!selectedCampaign}>
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={skipCopy}
                onChange={e => { setSkipCopy(e.target.checked); setSourceAdset(null) }}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">처음부터 직접 설정 (복사 없음)</span>
            </label>

            {!skipCopy && (
              <>
                {adsetLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />광고세트 불러오는 중...
                  </div>
                )}
                {!adsetLoading && adsets.length > 0 && (
                  <div className="relative">
                    <select
                      value={sourceAdset?.id ?? ''}
                      onChange={e => setSourceAdset(adsets.find(a => a.id === e.target.value) ?? null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                    >
                      <option value="">— 광고세트 선택 ({adsets.length}개) —</option>
                      {adsets.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.status === 'ACTIVE' ? '🟢' : '⏸'} {a.name} | ₩{parseBudget(a).toLocaleString()}/일 | {(a.created_time ?? '').slice(0, 10)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                )}
                {!adsetLoading && adsets.length === 0 && (
                  <p className="text-sm text-gray-500">광고세트가 없습니다. 기본값으로 설정됩니다.</p>
                )}
                {sourceAdset && (
                  <p className="text-xs text-gray-500">
                    타겟: <span className="font-medium">{detectTargeting(sourceAdset).key}</span> | 예산: <span className="font-medium">₩{parseBudget(sourceAdset).toLocaleString()}/일</span>
                  </p>
                )}
              </>
            )}
          </div>
        </SectionCard>

        {/* 4단계: 광고세트 설정 */}
        <SectionCard step={4} title="신규 광고세트 설정" disabled={!selectedCampaign}>
          <div className="space-y-4">
            {/* 광고세트명 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">광고세트명 *</label>
              <input
                type="text"
                value={adsetName}
                onChange={e => setAdsetName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {nameError && (
                <div className="mt-2">
                  <Alert type="warn">{nameError}</Alert>
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer">네이밍 규칙 보기</summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="text-xs w-full border border-gray-200 rounded-lg overflow-hidden">
                        <thead className="bg-gray-50">
                          <tr>
                            {['순서', '항목', '예시 값'].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-gray-600 font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ADSET_NAMING_RULE.map(r => (
                            <tr key={r.num} className="border-t border-gray-100">
                              <td className="px-3 py-1.5 text-gray-500">{r.num}</td>
                              <td className="px-3 py-1.5 text-gray-700">{r.field}</td>
                              <td className="px-3 py-1.5 font-mono text-gray-600">{r.values}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-1 text-gray-400">예: <code className="bg-gray-100 px-1 rounded">aos_purchase_lookalike_dcj_vd_이사워킹맘(대형폐기물)_sj1_26.03.04</code></p>
                    </div>
                  </details>
                </div>
              )}
            </div>

            {/* 저장된 타겟 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">저장된 타겟 (Meta Saved Audiences)</label>
              {savedAudiences.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedSavedAudience?.id ?? ''}
                    onChange={e => setSelectedSavedAudience(savedAudiences.find(a => a.id === e.target.value) ?? null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                  >
                    <option value="">(선택 안 함)</option>
                    {savedAudiences.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({(a.created_time ?? '').slice(0, 10)})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              ) : (
                <p className="text-sm text-gray-400">저장된 타겟이 없습니다.</p>
              )}
            </div>

            {/* 예산 */}
            {isCbo ? (
              <Alert type="info">CBO 캠페인 — 세트 예산 설정 불필요</Alert>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">일예산 (KRW) *</label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={budget}
                  onChange={e => setBudget(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        </SectionCard>

        {/* 5단계: 파일 업로드 */}
        <SectionCard step={5} title="콘텐츠 파일 업로드" disabled={!selectedCampaign}>
          <div className="space-y-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
              role="button"
              tabIndex={0}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">영상(mp4/mov) 또는 이미지(jpg/jpeg/png)</p>
              <p className="text-xs text-gray-400 mt-1">여러 개 선택 가능</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".mp4,.mov,.jpg,.jpeg,.png"
              className="hidden"
              onChange={e => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <div className="space-y-1">
                <Alert type="success">{files.length}개 파일 선택됨</Alert>
                {files.map((f, i) => (
                  <div key={i} className="flex justify-between text-xs text-gray-500 px-1">
                    <span>• {f.name}</span>
                    <span>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        {/* 6단계: 광고명 + 문구 */}
        <SectionCard step={6} title="광고 소재 이름 & 문구" disabled={!selectedCampaign || files.length === 0}>
          <div className="space-y-4">
            {/* 광고명 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">파일별 광고명</p>
              {files.map((f, i) => (
                <div key={i}>
                  <label className="text-xs text-gray-500 mb-0.5 block">[{i + 1}] {f.name}</label>
                  <input
                    type="text"
                    value={adNames[i] ?? ''}
                    onChange={e => setAdNames(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>

            {/* 광고 제목 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">광고 제목</label>
              <input
                type="text"
                value={adTitle}
                onChange={e => setAdTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 광고 문구 */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <label className="text-sm font-medium text-gray-700">광고 문구</label>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDefaultMsg}
                    onChange={e => setUseDefaultMsg(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  기본 문구 사용
                </label>
              </div>
              {useDefaultMsg ? (
                <details>
                  <summary className="text-xs text-gray-400 cursor-pointer">현재 저장된 기본 문구 확인</summary>
                  <pre className="mt-2 text-xs bg-gray-50 p-3 rounded-lg whitespace-pre-wrap text-gray-600">{adMessage}</pre>
                </details>
              ) : (
                <div className="flex gap-2">
                  <textarea
                    value={adMessage}
                    onChange={e => setAdMessage(e.target.value)}
                    rows={8}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                  <button
                    onClick={() => { localStorage.setItem('meta_ad_message', adMessage) }}
                    className="flex flex-col items-center gap-1 px-3 py-2 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded-lg"
                    title="기본 문구로 저장"
                  >
                    <Save className="w-4 h-4" />
                    저장
                  </button>
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* 실행 전 요약 + 실행 버튼 */}
        {selectedCampaign && adsetName.trim() && files.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5 space-y-4">
            <h2 className="font-semibold text-gray-800">실행 전 요약</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              {[
                ['OS', os?.toUpperCase()],
                ['캠페인', selectedCampaign.name],
                ['광고세트명', adsetName.trim()],
                ['타겟', selectedSavedAudience?.name ?? `${targetingKey} (직접)`],
                ['일예산', isCbo ? 'CBO' : `₩${budget.toLocaleString()}`],
                ['파일 수', `${files.length}개`],
                ['상태', '⏸ PAUSED'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">{k}</span>
                  <span className="text-gray-800 font-medium truncate">{v}</span>
                </div>
              ))}
            </div>

            {finalErrors.map((e, i) => <Alert key={i} type="error">{e}</Alert>)}

            <div className="flex gap-3">
              <button
                onClick={() => handleRun(true)}
                disabled={!canRun || isRunning}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                {isRunning && isDryRun ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                미리보기 (API 호출 없음)
              </button>
              <button
                onClick={() => handleRun(false)}
                disabled={!canRun || isRunning}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
              >
                {isRunning && !isDryRun ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                광고 생성 시작
              </button>
            </div>
          </div>
        )}

        {/* 진행 로그 */}
        {(isRunning || logLines.length > 0) && (
          <div className="bg-gray-900 rounded-xl p-5 space-y-1 max-h-96 overflow-y-auto">
            <div className="flex items-center gap-2 mb-3">
              {isRunning && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
              <span className="text-sm font-medium text-gray-300">
                {isDryRun ? '미리보기 실행 중...' : '광고 생성 중...'}
              </span>
            </div>
            {logLines.map((line, i) => (
              <p key={i} className="text-xs font-mono text-gray-300 whitespace-pre-wrap">{line}</p>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {/* 오류 */}
        {runError && <Alert type="error">{runError}</Alert>}

        {/* 결과 */}
        {adResults && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">결과</h2>
              <button
                onClick={() => { setAdResults(null); setLogLines([]); setRunError('') }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                <RotateCcw className="w-3 h-3" />초기화
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg px-4 py-2 text-sm font-mono text-gray-700">
              광고세트 ID: {resultAdsetId}
            </div>

            <div className="space-y-2">
              {adResults.map((r, i) => (
                r.status === 'ok' ? (
                  <div key={i} className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-2 rounded-lg">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>{r.adName} | 광고 ID: {r.adId}</span>
                  </div>
                ) : (
                  <details key={i} className="bg-red-50 px-4 py-2 rounded-lg">
                    <summary className="flex items-center gap-2 text-sm text-red-700 cursor-pointer">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {r.file} — 오류 상세
                    </summary>
                    <pre className="mt-2 text-xs text-red-600 whitespace-pre-wrap">{r.error}</pre>
                  </details>
                )
              ))}
            </div>

            {!isDryRun && adResults.length > 0 && (
              <a
                href={`data:application/json,${encodeURIComponent(resultJson)}`}
                download={`created_${new Date().toISOString().replace(/[:.]/g, '-')}.json`}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                결과 JSON 다운로드
              </a>
            )}

            <Alert type="warn">광고 활성화는 Meta 광고 관리자에서 직접 진행하세요.</Alert>
          </div>
        )}
      </main>
    </div>
  )
}
