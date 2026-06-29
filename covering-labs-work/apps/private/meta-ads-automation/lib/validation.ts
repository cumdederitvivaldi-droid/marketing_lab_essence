export function validateAdsetName(name: string): string | null {
  const parts = name.split('_')
  if (parts.length < 8) return `세그먼트가 부족합니다 (현재 ${parts.length}개, 최소 8개 필요)`
  if (!['aos', 'ios'].includes(parts[0])) return `[1] OS는 \`aos\` 또는 \`ios\` 여야 합니다 → 현재: \`${parts[0]}\``
  if (!['purchase', 'install', 'registration'].includes(parts[1])) return `[2] 세트목표는 purchase / install / registration 중 하나여야 합니다 → 현재: \`${parts[1]}\``
  if (!['all', 're', 'lookalike'].includes(parts[2])) return `[3] 세팅_타겟은 all / re / lookalike 중 하나여야 합니다 → 현재: \`${parts[2]}\``
  if (!['cr', 'cna', 'asn', 'dcj'].includes(parts[3])) return `[4] 지역코드는 cr / cna / asn / dcj 중 하나여야 합니다 → 현재: \`${parts[3]}\``
  if (!['vd', 'im', 'all', 'slide'].includes(parts[4])) return `[5] 콘텐츠_형식은 vd / im / all / slide 중 하나여야 합니다 → 현재: \`${parts[4]}\``
  // parts[5]..parts[length-3] = 자유형식 컨셉(후킹) — 언더스코어 포함 가능
  if (!/^[a-z]+\d+$/.test(parts[parts.length - 2])) return `[7] 담당자+버전은 영문소문자+숫자 형식이어야 합니다 (예: mk1, sj2) → 현재: \`${parts[parts.length - 2]}\``
  const datePart = parts[parts.length - 1]
  if (!/^\d{2}\.\d{2}\.\d{2}$/.test(datePart)) return `[마지막] 날짜는 \`YY.MM.DD\` 형식이어야 합니다 → 현재: \`${datePart}\``
  const [yy, mm, dd] = datePart.split('.').map(Number)
  if (mm < 1 || mm > 12) return `[마지막] 날짜 월이 유효하지 않습니다 (1–12) → 현재: \`${datePart}\``
  const year = 2000 + yy
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (dd < 1 || dd > daysInMonth[mm - 1]) return `[마지막] 날짜 일이 유효하지 않습니다 → 현재: \`${datePart}\``
  return null
}
