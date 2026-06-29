import { supabase } from "@/lib/supabase/client";
import { AMBIGUOUS_ITEMS, detectAmbiguousItems, type AmbiguousItem } from "@/lib/ai/ambiguous-items";
import type { CollectedInfo } from "@/lib/ai/phases";
import type { BasicInfoQuestion, BasicInfoResponse, ButtonDetection } from "./types";

/**
 * 전화번호 유효성 검증 — 형식 외에 명백한 가짜 번호만 차단
 * ex) 01011111111 (동일 숫자 8자리 반복)
 */
export function isValidPhoneNumber(phone: string): boolean {
  // 기본 형식: 010/011/016/017/018/019 + 7~8자리
  if (!/^01[016789]\d{7,8}$/.test(phone)) return false;
  const suffix = phone.slice(3);
  // 동일 숫자 7자리 이상 반복만 차단 (예: 00000000, 11111111)
  if (/^(\d)\1{6,}$/.test(suffix)) return false;
  return true;
}

/**
 * 고객 이름 추출 — 오탐 최소화
 *
 * 오탐 원인: "천호동이요", "통돌이에요", "확정입니다" 등에서 이름으로 잘못 인식
 * 해결: 명시적 이름 패턴만 사용 + 주소/품목 접미사 필터 + NOT_NAMES 확장
 *
 * @param message 고객 메시지
 * @param opts.contextAskedName  직전 assistant 가 "성함"/"이름" 을 직접 요청한 직후라면 true.
 *   짧은 한글-only 메시지(예: "민윤경") 도 이름으로 인정 (Pattern 8). 기본 false.
 */
export function extractCustomerName(
  message: string,
  opts?: { contextAskedName?: boolean },
): string | null {
  // 이름이 아닌 일반 단어/동사/형용사 제외
  const NOT_NAMES = new Set([
    // 종결 어미 (문장 끝에 한글 2-4자로 남을 수 있음 — "...입니다" 전체가 잡히는 경우 방어)
    "입니다", "이에요", "이구요", "이고요", "예요", "이야", "이지", "이네",
    "맞습", "맞아", "같아", "네요", "어요", "아요", "군요", "지요",
    // 일반 동사/형용사
    "포함", "가능", "불가", "사용", "필요", "확인", "진행", "예약", "변경", "추가", "제거",
    "감사", "부탁", "수고", "안녕", "처리", "완료", "접수", "문의", "상담", "견적",
    "결제", "취소", "환불", "시작", "종료", "마감", "대기", "배달", "수거", "철거",
    "확정", "동의", "거부", "원해", "싫어", "좋아", "괜찮", "가격", "비용", "금액",
    // 품목 관련 — 제품DB 기반 + 일반 품목명
    "침대", "소파", "냉장", "세탁", "장롱", "냉장고", "세탁기", "에어컨", "책상", "의자",
    "식탁", "옷장", "책장", "행거", "화장대", "서랍장", "신발장", "장농", "붙박이",
    "매트", "프레임", "통돌", "드럼", "양문", "김치",
    "밥상", "탁자", "테이블", "선반", "거울", "화분", "캐비닛", "파티션", "작업대",
    "거실장", "장식장", "수납장", "욕실장", "캣타워", "씽크대", "세면대",
    "가습기", "건조기", "선풍기", "정수기", "제습기", "청소기", "비데", "인덕션",
    "모니터", "프린터", "복사기", "스피커", "키보드", "압축기", "파쇄기",
    "골프백", "런닝", "사이클", "스키", "덤벨", "요가",
    "유모차", "보행기", "카시트", "킥보드",
    "가구", "가전", "수납", "포장", "잡동사니", "레저", "운동", "악기", "주방", "욕실",
    "첼로", "기타", "요람", "러그", "침낭", "헌책",
    "일반", "일반형", "싸이즈", "사이즈", "대형", "소형", "중형",
    // 주소/장소 관련
    "주소", "층수", "아파트", "빌라", "오피스", "사무실", "거실", "주차장",
    "서울", "경기", "인천",
    // 단위/수량 관련 (예: "3인용" → "인용" 오탐 방지)
    "인용", "인분", "인실", "인석",
  ]);

  // 주소/장소 접미사 — 이런 접미사로 끝나면 이름이 아님
  // "호"는 이름에 흔함(영호, 민호, 지호 등) → 제외. 숫자+호(1304호)는 이름 패턴에 안 걸림
  const PLACE_SUFFIXES = /[동구시로길읍면리층]$/;
  // 품목/일반명사 접미사 — 이런 접미사로 끝나면 이름이 아님
  const ITEM_SUFFIXES = /(?:장고|탁기|에컨|장대|랍장|발장|침대|소파|식탁|옷장|책장|행거|의자|장롱|장농|피아노|선반|거울|화분|테이블|러너|런닝|캐비닛|싱크|욕조|금고|케이지|세트)$/;

  function isValidName(candidate: string): boolean {
    if (!candidate || candidate.length < 2 || candidate.length > 4) return false;
    if (NOT_NAMES.has(candidate)) return false;
    if (PLACE_SUFFIXES.test(candidate)) return false;
    if (ITEM_SUFFIXES.test(candidate)) return false;
    // 숫자가 포함되면 이름 아님
    if (/\d/.test(candidate)) return false;
    return true;
  }

  // Pattern 1 (가장 확실): "이름: 홍길동", "성함은 홍길동", "성명: 홍길동"
  const explicitMatch = message.match(/(?:이름|성함|성명)\s*[:\s은는이가]\s*([가-힣]{2,4})/);
  if (explicitMatch && isValidName(explicitMatch[1])) return explicitMatch[1];

  // Pattern 2 (신중하게): "홍길동입니다" — 단, 문맥상 이름을 말하는 것으로 보일 때만
  // "이름/성함" 키워드가 대화에 있거나, 메시지가 짧을 때만 (긴 문장에서는 오탐 가능성 높음)
  // ⚠️ 숫자 바로 뒤의 한글은 제외 (예: "3인용이에요" → "인용" 오탐 방지)
  // ⚠️ 후보 앞에 다른 한글 단어가 있으면 품목 설명일 가능성 높음 → 제외
  const selfIntroMatch = message.match(/(?<![0-9])([가-힣]{2,4})\s*(?:입니다|이에요|이구요|이고요)/);
  if (selfIntroMatch && isValidName(selfIntroMatch[1])) {
    const hasNameContext = /이름|성함|성명/.test(message);
    if (hasNameContext) return selfIntroMatch[1];
    // 후보 앞에 다른 한글 단어가 있으면 품목 설명 → 이름 아님
    // 예: "일반 싸이즈 밥상입니다" → "일반 싸이즈 " 앞에 한글 있음 → 제외
    const beforeCandidate = message.slice(0, selfIntroMatch.index).trim();
    const hasKoreanBefore = /[가-힣]/.test(beforeCandidate);
    if (!hasKoreanBefore) {
      const isShortMessage = message.replace(/\s/g, "").length <= 10;
      if (isShortMessage) return selfIntroMatch[1];
    }
  }

  // Pattern 3: "홍길동 010-1234-5678" 또는 "홍길동, 010-..." 또는 "홍길동/010-..." 또는 "홍길동. 010-..."
  // `[-\s]*` — 전화번호 그룹 사이 다중 공백/하이픈 허용 ("010  3234  6915" 대응)
  const namePhoneMatch = message.match(/(?<![가-힣])([가-힣]{2,4})\s*[,./\s]*\s*\d{2,3}[-\s]*\d{3,4}[-\s]*\d{4}/);
  if (namePhoneMatch && isValidName(namePhoneMatch[1])) return namePhoneMatch[1];

  // Pattern 4: "홍길동이요 010-1234-5678" 또는 "홍길동입니다, 010-..." (이름+어미 + 전화번호)
  const nameWithSuffixPhoneMatch = message.match(/([가-힣]{2,4})\s*(?:이요|이에요|입니다|이구요)\s*[,\s]*\s*\d{2,3}[-\s]*\d{3,4}[-\s]*\d{4}/);
  if (nameWithSuffixPhoneMatch && isValidName(nameWithSuffixPhoneMatch[1])) return nameWithSuffixPhoneMatch[1];

  // Pattern 5: 번호 목록 포맷 — "1. 이승태\n2. 010-4807-1592" 또는 "① 이승태\n② 010-..."
  const numberedListMatch = message.match(/(?:^|\n)\s*(?:1|①|1\))\s*[.)\]:]?\s*([가-힣]{2,4})\s*(?:\n|\r)+\s*(?:2|②|2\))\s*[.)\]:]?\s*\d{2,3}[-\s]*\d{3,4}[-\s]*\d{4}/);
  if (numberedListMatch && isValidName(numberedListMatch[1])) return numberedListMatch[1];

  // Pattern 6: 역순 번호 목록 — "1. 010-...\n2. 이승태"
  const numberedListReverseMatch = message.match(/(?:^|\n)\s*(?:1|①|1\))\s*[.)\]:]?\s*\d{2,3}[-\s]*\d{3,4}[-\s]*\d{4}\s*(?:\n|\r)+\s*(?:2|②|2\))\s*[.)\]:]?\s*([가-힣]{2,4})/);
  if (numberedListReverseMatch && isValidName(numberedListReverseMatch[1])) return numberedListReverseMatch[1];

  // Pattern 7: "010-1234-5678 홍길동" (전화번호 먼저, 이름 뒤)
  const phoneNameMatch = message.match(/\d{2,3}[-\s]*\d{3,4}[-\s]*\d{4}\s*[,/\s]*\s*([가-힣]{2,4})(?:\s*$|[^가-힣])/);
  if (phoneNameMatch && isValidName(phoneNameMatch[1])) return phoneNameMatch[1];

  // Pattern 8 (이전: 단독 한글 2-4자 — "민윤경" 같은 케이스) 은 AI 기반
  //   extractCollectedInfo.customerName 로 대체됨. "네네" 같은 응답 오탐 방지.

  return null;
}

// 해피톡 webhook에서 이미지 URL 추출 (다중 이미지 지원)
export function extractImageUrls(body: Record<string, unknown>): string[] {
  const urls: string[] = [];

  const attachment = body.attachment as { url?: string } | undefined;
  if (attachment?.url) urls.push(attachment.url);

  if (body.image_url && typeof body.image_url === "string") {
    if (!urls.includes(body.image_url)) urls.push(body.image_url);
  }

  const contents = body.contents as (string | { url?: string; comment?: string })[] | undefined;
  if (Array.isArray(contents)) {
    for (const item of contents) {
      if (typeof item === "object" && item?.url && !urls.includes(item.url)) urls.push(item.url);
      if (typeof item === "string" && (item.startsWith("http://") || item.startsWith("https://")) && !urls.includes(item)) urls.push(item);
    }
  }

  return urls;
}

/**
 * 최근 연속 고객 텍스트 메시지를 합침 + DB에서도 하나로 병합
 * (마지막 assistant/이미지/파일 메시지 이후의 텍스트 user 메시지들)
 *
 * 1개면 그대로 반환, 2개 이상이면 첫 메시지에 합치고 나머지 삭제
 * ⚠️ 이미지/파일 메시지는 병합 대상에서 제외 — 사진이 삭제되지 않도록
 */
export async function mergeConsecutiveUserMessages(sessionId: string): Promise<string> {
  const { data: recentMsgs } = await supabase
    .from("messages")
    .select("id, role, content, message_type, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!recentMsgs?.length) return "";

  // 최신→과거 순으로 되어있으므로, 연속된 텍스트 user 메시지만 수집
  // 이미지/파일 메시지를 만나면 중단 (사진 보호)
  const userMsgs: { id: string; content: string }[] = [];
  let prevAssistantMsg: string | null = null;
  for (const msg of recentMsgs) {
    if (msg.role !== "user") {
      if (msg.role === "assistant") prevAssistantMsg = msg.content ?? "";
      break; // assistant 메시지를 만나면 중단
    }
    const msgType = msg.message_type ?? "text";
    if (msgType === "image" || msgType === "file") break; // 이미지/파일을 만나면 중단
    if (msg.content?.trim()) {
      userMsgs.push({ id: msg.id, content: msg.content.trim() });
    }
  }

  if (userMsgs.length === 0) return "";

  // ★ 버튼 질문 직후의 연속 메시지는 병합하지 않음
  // 고객이 버튼 응답을 여러 줄로 나눠 보낸 경우 각각이 다른 질문 응답일 수 있음
  // 예: "컴퓨터/학생 책상" + "주니어/소형 옷장" → 책상 응답 + 장롱 응답
  if (userMsgs.length > 1 && prevAssistantMsg) {
    const isButtonQuestion = AMBIGUOUS_ITEMS.some(
      (item) => prevAssistantMsg!.includes(item.question)
    );
    if (isButtonQuestion) {
      // 병합 없이 마지막(최신) 메시지만 반환
      // (나머지 메시지들은 이전 debounce에서 이미 처리됨)
      console.log(`[Webhook/debounce] ${sessionId}: 버튼 질문 직후 → 병합 스킵 (${userMsgs.length}개, 최신만 처리)`);
      return userMsgs[userMsgs.length - 1].content;
    }
  }

  // 역순으로 다시 뒤집어서 시간순 정렬 (AI 컨텍스트용으로만 합침, DB는 건드리지 않음)
  userMsgs.reverse();
  const mergedText = userMsgs.map(m => m.content).join("\n");

  if (userMsgs.length > 1) {
    console.log(`[Webhook/debounce] ${sessionId}: ${userMsgs.length}개 연속 메시지 합쳐서 AI 처리 (DB 원본 유지)`);
  }

  return mergedText;
}

/** 중복 메시지 체크: 같은 세션에서 동일 내용의 user 메시지가 있으면 중복
 *  - 짧은 메시지(≤15자, 버튼 응답 가능성 높음): 3분 윈도우
 *  - 긴 메시지(자유 텍스트): 30초 윈도우
 */
export async function isDuplicateMessage(sessionId: string, content: string): Promise<boolean> {
  const windowMs = content.trim().length <= 15 ? 180000 : 30000; // 3분 vs 30초
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("session_id", sessionId)
    .eq("role", "user")
    .eq("content", content)
    .gt("created_at", cutoff)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export function detectButtonResponse(
  messages: { role: string; content: string }[],
  userMessage: string
): ButtonDetection {
  const text = userMessage.trim();

  // 안전장치: 긴 메시지는 자유 텍스트
  if (text.length > 30) return { isButton: false, type: null };
  // 안전장치: 주소 패턴 포함 시 자유 텍스트 (주소 변경 감지 보장)
  if (/[가-힣]+(동|구|로|길)\s*\d/.test(text)) return { isButton: false, type: null };
  if (/\d{2,}[-\s]?\d+/.test(text) && /[가-힣]/.test(text)) return { isButton: false, type: null };

  // 1. 모호 품목 버튼 응답 감지: 마지막 assistant 메시지가 AMBIGUOUS_ITEMS의 question이고,
  //    userMessage가 해당 options의 label과 정확히 일치
  const reversed = [...messages].reverse();
  const lastAssistant = reversed.find((m) => m.role === "assistant");
  if (lastAssistant) {
    for (const item of AMBIGUOUS_ITEMS) {
      if (!lastAssistant.content.includes(item.question)) continue;
      const isExactMatch = item.options.some((opt) => text === opt.label);
      if (isExactMatch) {
        return { isButton: true, type: "ambiguous_item" };
      }
    }
  }

  // 2. 기본정보 버튼 응답 감지
  const parsed = parseBasicInfoResponse(messages, userMessage);
  if (parsed) {
    return { isButton: true, type: "basic_info" };
  }

  return { isButton: false, type: null };
}

/** 기본정보(층수/엘베/주차) 버튼 질문 정의 */
export const BASIC_INFO_QUESTIONS: BasicInfoQuestion[] = [
  {
    key: "floor",
    question: "🏢 층수가 어떻게 되시나요?",
    options: [
      { label: "1층", value: 1 },
      { label: "2~3층", value: 3 },
      { label: "4~5층", value: 5 },
      { label: "6층 이상", value: 6 },
      { label: "지하", value: -1 },
    ],
  },
  {
    key: "elevator",
    question: "🛗 엘리베이터 사용이 가능한가요?",
    options: [
      { label: "사용 가능", value: true },
      { label: "사용 불가", value: false },
    ],
  },
  {
    key: "parking",
    question: "🅿️ 주차가 가능한가요?",
    options: [
      { label: "가능", value: true },
      { label: "불가능", value: false },
    ],
  },
];

/** 사용자 메시지가 기본정보 버튼 응답인지 파싱 */
export function parseBasicInfoResponse(
  messages: { role: string; content: string }[],
  userMessage: string
): BasicInfoResponse | null {
  const reversed = [...messages].reverse();
  const lastAssistant = reversed.find((m) => m.role === "assistant");
  if (!lastAssistant) return null;

  const text = userMessage.trim();

  for (const q of BASIC_INFO_QUESTIONS) {
    if (!lastAssistant.content.includes(q.question)) continue;

    // 1. 정확한 버튼 텍스트 매칭 (text === label)
    for (const opt of q.options) {
      if (text === opt.label) {
        return { key: q.key, value: opt.value };
      }
    }

    // 2. Fuzzy 매칭은 짧은 메시지(10자 이하)에서만 적용
    //    → "견적 확인했어요 예약 부탁드려요"(17자) 같은 문장에서 오탐 방지
    if (text.length > 10) continue;

    // 2a. 버튼 label 포함 매칭 (짧은 메시지만)
    for (const opt of q.options) {
      if (text.includes(opt.label)) {
        return { key: q.key, value: opt.value };
      }
    }

    // 2b. 층수: 자유 입력 파싱
    if (q.key === "floor") {
      if (text.includes("지하")) return { key: "floor", value: -1 };
      const floorMatch = text.match(/(\d+)\s*층/);
      if (floorMatch) return { key: "floor", value: parseInt(floorMatch[1]) };
    }

    // 2c. 엘리베이터: 다양한 표현 (짧은 메시지만, "예" 제거 — "예약"과 충돌 방지)
    if (q.key === "elevator") {
      if (/가능|있어|있음|있습|네|응/.test(text)) return { key: "elevator", value: true };
      if (/불가|없어|없음|없습|아니/.test(text)) return { key: "elevator", value: false };
    }

    // 2d. 주차: 다양한 표현 (짧은 메시지만, "예" 제거 — "예약"과 충돌 방지)
    if (q.key === "parking") {
      if (/가능|돼|되|있어|있음|네|응/.test(text)) return { key: "parking", value: true };
      if (/불가|안돼|안되|없어|없음|아니/.test(text)) return { key: "parking", value: false };
    }
  }

  return null;
}

/** 다음 미수집 기본정보 질문 찾기 (1층/지하면 엘리베이터 스킵) */
export function findNextBasicInfoQuestion(
  info: CollectedInfo
): { question: BasicInfoQuestion | null; autoSet?: { key: string; value: boolean } } {
  for (const q of BASIC_INFO_QUESTIONS) {
    if (q.key === "floor" && info.floor === null) return { question: q };
    if (q.key === "elevator" && info.elevator === null) {
      // 1층 또는 지하면 엘리베이터 질문 불필요 → 자동으로 "사용 불가" 설정
      if (info.floor === 1 || info.floor === -1) {
        return { question: null, autoSet: { key: "elevator", value: false } };
      }
      return { question: q };
    }
    if (q.key === "parking" && info.parking === null) return { question: q };
  }
  return { question: null };
}

/**
 * 키워드가 현재 버튼 응답 대기 중인 모호한 품목인지 확인
 * - 키워드가 모호한 카테고리에 속하는데 세부 옵션 미확정 AND
 * - 원래 고객 메시지에서 해당 카테고리가 모호하게 감지됨 (버튼 질문 대상)
 * → 버튼 응답 올 때까지 매핑 보류
 *
 * "장농12자" → 치수 확정 → 모호 감지 안됨 → 매핑 허용
 * "작은냉장고" → 수식어 확정 → 모호 감지 안됨 → 매핑 허용
 * "식탁" → 모호 감지됨 → 버튼 대기 → 매핑 보류
 */
export function isPendingAmbiguousItem(
  keyword: string,
  messages: { role: string; content: string }[]
): boolean {
  const normalized = keyword.replace(/\s/g, "");

  for (const item of AMBIGUOUS_ITEMS) {
    const matchesPattern = item.patterns.some((p) => normalized.includes(p));
    if (!matchesPattern) continue;

    // 이미 세부 옵션과 일치하면 확정됨 → 매핑 허용
    const isSpecific = item.options.some((opt) =>
      normalized.includes(opt.label.replace(/\s/g, "")) ||
      normalized.includes(opt.keyword.replace(/\s/g, ""))
    );
    if (isSpecific) return false;

    // 원래 고객 메시지에서 이 그룹이 모호하게 감지되었는지 확인
    let wasDetectedAmbiguous = false;
    for (const m of messages) {
      if (m.role !== "user") continue;
      const detected = detectAmbiguousItems(m.content);
      if (detected.some((d) => d.question === item.question)) {
        wasDetectedAmbiguous = true;
        break;
      }
    }

    if (!wasDetectedAmbiguous) {
      // 원래 메시지에서 모호하지 않았음 (수식어/치수로 확정)
      // 예: "장농12자" → hasMeasurement, "작은냉장고" → hasQualifier
      // 키워드에 사이즈 힌트가 있어도 이 경우에만 허용
      continue;
    }

    // 이 그룹이 모호하게 감지됨 → 질문/응답 완료 여부 확인
    // (사이즈 힌트가 있더라도 그룹 자체가 모호하면 버튼 응답 대기)
    // 예: "침대를 버릴려고... 킹침대" → "침대" 그룹 모호 → "킹침대"도 대기
    const questionIdx = messages.findIndex(
      (m) => m.role === "assistant" && m.content.includes(item.question)
    );

    if (questionIdx === -1) {
      // 버튼 아직 안 보냄 → 보류 (버튼 전송 대기)
      return true;
    }

    // 버튼 보냄 → 응답 왔는지 확인
    const afterQuestion = messages.slice(questionIdx + 1);
    const hasResponse = afterQuestion.some((m) => m.role === "user");

    // 응답 없으면 보류, 있으면 매핑 허용
    return !hasResponse;
  }

  return false;
}

/**
 * 버튼 응답이 완료된 모호 품목의 원본 키워드를 필터링하여 중복 견적 방지
 * 예: 고객 "장농 3짝" → AI 질문 → 고객 "장롱 3자" 선택
 *     → 원본 "장농"(qty=3) 제거, 선택 "장롱 3자"만 유지
 * 1:1 매핑인 경우 원본 수량을 선택 결과에 이전
 */
export function filterResolvedAmbiguousItems(
  items: { keyword: string; quantity: number; raw?: string }[],
  messages: { role: string; content: string }[]
): { keyword: string; quantity: number; raw?: string }[] {
  // 응답 완료된 모호 품목 그룹 식별
  const resolvedGroups: AmbiguousItem[] = [];
  for (const ambItem of AMBIGUOUS_ITEMS) {
    const qIdx = messages.findIndex(
      (m) => m.role === "assistant" && m.content.includes(ambItem.question)
    );
    if (qIdx === -1) continue;
    if (messages.slice(qIdx + 1).some((m) => m.role === "user")) {
      resolvedGroups.push(ambItem);
    }
  }
  if (resolvedGroups.length === 0) return items;

  const isSpecificOption = (norm: string, group: AmbiguousItem) =>
    group.options.some(
      (opt) =>
        norm.includes(opt.label.replace(/\s/g, "")) ||
        norm.includes(opt.keyword.replace(/\s/g, ""))
    );

  // 그룹별 원본 수량 합계 + 선택 개수 수집 (수량 이전 판단용)
  const originalQtyByGroup = new Map<string, number>();
  const specificCountByGroup = new Map<string, number>();

  for (const item of items) {
    const norm = item.keyword.replace(/\s/g, "");
    for (const group of resolvedGroups) {
      if (!group.patterns.some((p) => norm.includes(p))) continue;
      const key = group.question;
      if (isSpecificOption(norm, group)) {
        specificCountByGroup.set(key, (specificCountByGroup.get(key) ?? 0) + 1);
      } else {
        originalQtyByGroup.set(key, (originalQtyByGroup.get(key) ?? 0) + item.quantity);
      }
      break;
    }
  }

  // 필터링: 원본 제거 + 1:1인 경우 수량 이전
  return items.filter((item) => {
    const norm = item.keyword.replace(/\s/g, "");
    for (const group of resolvedGroups) {
      if (!group.patterns.some((p) => norm.includes(p))) continue;
      const key = group.question;

      if (isSpecificOption(norm, group)) {
        // 버튼 선택 결과 → 유지, 1:1이면 수량 이전
        const origQty = originalQtyByGroup.get(key) ?? 0;
        const specCount = specificCountByGroup.get(key) ?? 0;
        if (specCount === 1 && origQty > 0 && item.quantity === 1) {
          item.quantity = origQty;
          console.log(`[AutoQuote] 모호→확정 수량 이전: ${origQty} → "${item.keyword}"`);
        }
        return true;
      }

      // 원본 모호 키워드 → 제거
      console.log(`[AutoQuote] 버튼 확정 → 원본 제거: "${item.keyword}" (qty=${item.quantity})`);
      return false;
    }
    return true;
  });
}

/**
 * 대화에서 버튼 응답(label → keyword) 매핑을 추출
 * 상담사가 보낸 버튼 질문 → 고객 응답 → ambiguous-items의 keyword로 해석
 */
export function resolveButtonKeywords(
  messages: { role: string; content: string }[]
): Map<string, string> {
  const resolved = new Map<string, string>();

  for (const item of AMBIGUOUS_ITEMS) {
    const qIdx = messages.findIndex(
      (m) => m.role === "assistant" && m.content.includes(item.question)
    );
    if (qIdx === -1) continue;

    // 질문 이후 첫 user 응답 찾기
    const userMsg = messages.slice(qIdx + 1).find((m) => m.role === "user");
    if (!userMsg) continue;

    const userText = userMsg.content.replace(/\s/g, "").toLowerCase();

    for (const opt of item.options) {
      const labelNorm = opt.label.replace(/\s/g, "").toLowerCase();
      if (userText === labelNorm || userText.includes(labelNorm) || labelNorm.includes(userText)) {
        // label의 다양한 변형을 모두 매핑
        resolved.set(opt.label.replace(/\s/g, "").toLowerCase(), opt.keyword);
        resolved.set(opt.keyword.replace(/\s/g, "").toLowerCase(), opt.keyword);
        break;
      }
    }
  }

  return resolved;
}

/** 추출된 keyword가 버튼 응답과 매칭되면 올바른 DB keyword로 변환 */
export function applyButtonResolution(
  keyword: string,
  buttonMap: Map<string, string>
): string {
  const norm = keyword.replace(/\s/g, "").toLowerCase();

  // 정확 매칭
  const exact = buttonMap.get(norm);
  if (exact) return exact;

  // 부분 매칭 (keyword가 button label의 일부이거나 반대)
  for (const [label, dbKeyword] of buttonMap) {
    if (norm.includes(label) || label.includes(norm)) {
      return dbKeyword;
    }
  }

  return keyword;
}
