/**
 * 모호한 품목 → 세부 선택지 매핑
 * 고객이 모호한 품목을 언급하면 버튼으로 세부 사양을 선택하도록 안내
 *
 * keyword는 DB products 테이블의 name(ilike) 또는 aliases(exact) 매칭 기준
 * ⚠️ keyword 수정 시 반드시 DB에서 매칭 테스트 필수!
 * 검색 순서: item_group exact → aliases exact → ilike (category, name, display_name, item_group)
 * label은 카카오톡 버튼에 표시되는 텍스트 (고객이 이해하기 쉽게)
 */

export interface AmbiguousItemOption {
  label: string;      // 버튼에 표시할 텍스트
  keyword: string;    // DB 검색용 키워드 (products 테이블 name과 일치)
}

export interface AmbiguousItem {
  patterns: string[];           // 고객 메시지에서 매칭할 키워드
  question: string;             // 질문 메시지
  options: AmbiguousItemOption[];
}

export const AMBIGUOUS_ITEMS: AmbiguousItem[] = [
  {
    // DB: 가전 - 중형 냉장고, 양문형 냉장고, 김치냉장고(스탠드/뚜껑형)
    patterns: ["냉장고"],
    question: "냉장고 종류를 선택해주세요!",
    options: [
      { label: "일반(중형) 냉장고", keyword: "중형 냉장고" },
      { label: "양문형 냉장고", keyword: "양문형 냉장고" },
      { label: "김치냉장고", keyword: "김치냉장고" },
    ],
  },
  {
    // 침대 Step 1: 구성 (세트/프레임/매트리스/2층/돌흙)
    // 고객이 "침대"만 언급 → 먼저 구성을 물어본 뒤, 선택에 따라 사이즈 질문 체이닝
    patterns: ["침대"],
    question: "침대 구성을 선택해주세요!",
    options: [
      { label: "침대 세트", keyword: "침대세트" },
      { label: "프레임만", keyword: "침대프레임만" },
      { label: "매트리스만", keyword: "매트리스만" },
      { label: "2층 침대", keyword: "2층침대 SET" },
      { label: "돌/흙 침대", keyword: "돌/흙침대 1인용" },
    ],
  },
  {
    // 침대 Step 2a: 세트 사이즈 (Step 1 "침대 세트" 클릭 시 체이닝)
    patterns: ["침대세트"],
    question: "침대 사이즈를 선택해주세요!",
    options: [
      { label: "싱글 침대 세트", keyword: "싱글침대" },
      { label: "슈퍼싱글 침대 세트", keyword: "수퍼싱글침대" },
      { label: "더블/퀸 침대 세트", keyword: "퀸침대" },
      { label: "킹 침대 세트", keyword: "킹침대" },
    ],
  },
  {
    // 침대 Step 2b: 프레임 사이즈 (Step 1 "프레임만" 클릭 시 체이닝)
    patterns: ["프레임만", "침대프레임만"],
    question: "프레임 사이즈를 선택해주세요!",
    options: [
      { label: "싱글 프레임", keyword: "싱글침대프레임" },
      { label: "슈퍼싱글 프레임", keyword: "슈퍼싱글프레임" },
      { label: "더블/퀸 프레임", keyword: "퀸침대프레임" },
      { label: "킹 프레임", keyword: "킹침대프레임" },
    ],
  },
  {
    // 침대 Step 2c: 매트리스 사이즈 (Step 1 "매트리스만" 클릭 또는 직접 "매트리스" 언급 시)
    patterns: ["매트리스"],
    question: "매트리스 사이즈를 선택해주세요!",
    options: [
      { label: "싱글 매트리스", keyword: "매트리스 싱글" },
      { label: "슈퍼싱글 매트리스", keyword: "매트리스 수퍼싱글" },
      { label: "더블/퀸 매트리스", keyword: "매트리스 퀸" },
      { label: "킹 매트리스", keyword: "매트리스 킹" },
    ],
  },
  {
    // DB: 소파 - 1인용, 2인용, 3인용, 4인용, 5인용, L자형
    // aliases: 1인용소파→1인용, 3인용소파→3인용, L자소파→L자형
    patterns: ["소파"],
    question: "소파 크기를 선택해주세요!",
    options: [
      { label: "1-2인용 소파", keyword: "1인용소파" },
      { label: "3인용 소파", keyword: "3인용소파" },
      { label: "4인용 이상 소파", keyword: "4인용소파" },
      { label: "L자형 소파", keyword: "L자소파" },
    ],
  },
  // 세탁기: 통돌이/드럼 동일 가격 → 질문 없이 바로 견적 (일반세탁기로 매핑)
  {
    // DB: 책상 - 140cm이하, 180cm이하, 180cm이상, 컴퓨터책상, 학생책상
    // ⚠️ 140cm이하, 180cm이상은 DB aliases 없음 → DB에 alias 추가 필요
    patterns: ["책상"],
    question: "책상 종류를 선택해주세요!",
    options: [
      { label: "일반 책상", keyword: "일반책상" },
      { label: "대형 책상 (180cm이상)", keyword: "180cm이상책상" },
      { label: "컴퓨터/학생 책상", keyword: "컴퓨터책상" },
    ],
  },
  {
    // DB: 테이블 - 거실테이블(원목)[54], 사이드테이블[56], 접이식테이블[58], 소파테이블[409]
    // "테이블" 단독 언급 시 종류 확인, "식탁" 선택 시 식탁 AMBIGUOUS로 체이닝
    patterns: ["테이블"],
    question: "🪵 테이블 종류를 선택해주세요!",
    options: [
      { label: "거실/원목 테이블", keyword: "거실테이블" },
      { label: "접이식 테이블", keyword: "접이식 테이블" },
      { label: "사이드/소파 테이블", keyword: "사이드 테이블" },
      { label: "식탁 (다이닝 테이블)", keyword: "식탁" },
    ],
  },
  {
    // DB: 식탁 - 6인용미만(의자포함), 6인용이상(의자포함), 대리석세트(의자포함)
    // aliases: 4인이하식탁→6인용미만, 6인이상식탁→6인용이상, 대리석식탁→대리석세트
    patterns: ["식탁"],
    question: "식탁 규모를 선택해주세요!",
    options: [
      { label: "4인 이하 식탁", keyword: "4인이하식탁" },
      { label: "6인 이상 식탁", keyword: "6인이상식탁" },
      { label: "대리석 식탁", keyword: "대리석식탁" },
    ],
  },
  {
    // DB: 장롱 - 3자, 4자, 주니어옷장, 붙박이장(1~3칸), 드레스룸(소/대)
    // aliases: 3자장롱→3자
    patterns: ["옷장", "장롱", "장농"],
    question: "장롱/옷장 크기를 선택해주세요!",
    options: [
      { label: "장롱 3자", keyword: "3자장롱" },
      { label: "장롱 4자", keyword: "4자장롱" },
      { label: "붙박이장", keyword: "붙박이장" },
      { label: "드레스룸", keyword: "드레스룸" },
      { label: "주니어/소형 옷장", keyword: "주니어옷장" },
    ],
  },
  // 책장: 기본값 2m이하 (item-normalizer KEYWORD_ALIASES)
  // 4m이하 대형 책장은 드물어 질문 제거. "대형 책장" / "N단 책장" 등 명시 시 자동 매핑됨.
  {
    // DB: 수납 - 행거(소형/중형/대형)
    // ⚠️ DB aliases 없음 → DB에 alias 추가 필요
    patterns: ["행거"],
    question: "행거 크기를 선택해주세요!",
    options: [
      { label: "소형 행거", keyword: "소형행거" },
      { label: "중형 행거", keyword: "중형행거" },
      { label: "대형 행거", keyword: "대형행거" },
    ],
  },
  {
    // DB: 가전 - 에어컨(스탠드), 에어컨(2in1), 에어컨(벽걸이)
    // aliases: 벽걸이에어컨→에어컨(벽걸이), 스탠드에어컨→에어컨(스탠드), 2in1에어컨→에어컨(2in1)
    patterns: ["에어컨"],
    question: "에어컨 종류를 선택해주세요!",
    options: [
      { label: "벽걸이 에어컨", keyword: "벽걸이에어컨" },
      { label: "스탠드 에어컨", keyword: "스탠드에어컨" },
      { label: "2in1 에어컨", keyword: "2in1에어컨" },
    ],
  },
  {
    // DB: 서랍장 - 3단이하, 6단이하, 와이드 서랍장
    // aliases: 소형서랍장→3단이하, 대형서랍장→6단이하
    patterns: ["서랍장"],
    question: "서랍장 크기를 선택해주세요!",
    options: [
      { label: "작은 서랍장 (3단 이하)", keyword: "소형서랍장" },
      { label: "큰 서랍장 (4단 이상)", keyword: "대형서랍장" },
      { label: "와이드 서랍장 (넓은형)", keyword: "와이드 서랍장" },
    ],
  },
  {
    // DB: 화장대 - 기본사이즈, 가정용(중), 가정용(대), 스탠딩 화장대
    // ⚠️ keyword에 괄호() 사용 금지 — PostgREST 필터 파싱 에러 발생
    // aliases 기반 키워드 사용: 기본화장대, 중형화장대, 대형화장대 등
    patterns: ["화장대"],
    question: "화장대 크기를 선택해주세요!",
    options: [
      { label: "일반 화장대 (1m 이하)", keyword: "기본화장대" },
      { label: "중형 화장대 (1~1.3m)", keyword: "중형화장대" },
      { label: "대형 화장대 (1.3m 이상)", keyword: "대형화장대" },
      { label: "스탠딩 화장대 (전신거울형)", keyword: "스탠딩화장대" },
    ],
  },
  {
    // DB: 사무 - 사무용 의자, 중역 의자, 게이밍 의자 / 식탁 - 의자 1개 / 유아 - 아기의자
    // aliases: 식탁의자→의자 1개
    patterns: ["의자"],
    question: "🪑 의자 종류를 선택해주세요!",
    options: [
      { label: "식탁 의자 (일반)", keyword: "식탁의자" },
      { label: "사무용/학생 의자", keyword: "사무용 의자" },
      { label: "게이밍 의자", keyword: "게이밍 의자" },
      { label: "중역 의자", keyword: "중역 의자" },
      { label: "아기의자", keyword: "아기의자" },
    ],
  },
  {
    // DB: 신발장 - 1m이하, 1m이상, 슬라이딩 신발장, 현관수납장
    // aliases: 일반신발장→1m이하, 대형신발장→1m이상
    patterns: ["신발장"],
    question: "신발장 크기를 선택해주세요!",
    options: [
      { label: "일반 신발장 (1m 이하)", keyword: "일반신발장" },
      { label: "큰 신발장 (1m 이상)", keyword: "대형신발장" },
      { label: "슬라이딩 신발장", keyword: "슬라이딩 신발장" },
      { label: "현관수납장", keyword: "현관수납장" },
    ],
  },
  {
    // DB: TV - 32/50/65/75인치 (5,000~20,000원)
    patterns: ["TV", "티비", "텔레비전"],
    question: "TV 크기를 선택해주세요!",
    options: [
      { label: "32인치 이하", keyword: "TV 32인치" },
      { label: "50인치", keyword: "TV 50인치" },
      { label: "65인치", keyword: "TV 65인치" },
      { label: "75인치 이상", keyword: "TV 75인치" },
    ],
  },
  {
    // DB: 악기 - 전자피아노(30K), 업라이트(100K), 그랜드(250K)
    patterns: ["피아노"],
    question: "피아노 종류를 선택해주세요!",
    options: [
      { label: "전자/디지털 피아노", keyword: "전자/디지털 피아노" },
      { label: "업라이트 피아노", keyword: "업라이트 피아노" },
      { label: "그랜드 피아노", keyword: "그랜드 피아노" },
    ],
  },
  {
    // DB: 사무 - 금고(소형)/금고(중형)/금고(대형)
    // ⚠️ DB aliases 없음 → DB에 alias 추가 필요
    patterns: ["금고"],
    question: "금고 크기를 선택해주세요!",
    options: [
      { label: "소형 금고", keyword: "소형금고" },
      { label: "중형 금고", keyword: "중형금고" },
      { label: "대형 금고", keyword: "대형금고" },
    ],
  },
  {
    // DB: 장식장 - 1m이내, 2m이내, 2m이상, 유리장식장
    // aliases: 소형장식장→1m이내, 중형장식장→2m이내, 대형장식장→2m이상
    patterns: ["장식장"],
    question: "장식장 크기를 선택해주세요!",
    options: [
      { label: "1m 이내", keyword: "소형장식장" },
      { label: "2m 이내", keyword: "중형장식장" },
      { label: "2m 이상", keyword: "대형장식장" },
      { label: "유리 장식장", keyword: "유리장식장" },
    ],
  },
  {
    // DB: 씽크대 - 상부(63K), 하부(108K)
    patterns: ["씽크대"],
    question: "씽크대 부분을 선택해주세요!",
    options: [
      { label: "씽크대 상부장", keyword: "씽크대 상부" },
      { label: "씽크대 하부장", keyword: "씽크대 하부" },
    ],
  },
  {
    // DB: 반려동물 - 케이지 소형(7K)/중형(17K)/대형(28K)
    patterns: ["케이지"],
    question: "케이지 크기를 선택해주세요!",
    options: [
      { label: "소형 케이지", keyword: "소형 케이지" },
      { label: "중형 케이지", keyword: "중형 케이지" },
      { label: "대형 케이지", keyword: "대형 케이지" },
    ],
  },
  {
    // DB: 캐비닛 - 사무용(26.5K), 서랍형(21.5K), 2m이하(40.5K)
    // aliases: 대형캐비닛→2m이하
    patterns: ["캐비닛"],
    question: "캐비닛 종류를 선택해주세요!",
    options: [
      { label: "서랍형 캐비닛", keyword: "서랍형 캐비닛" },
      { label: "사무용 캐비닛", keyword: "사무용 캐비닛" },
      { label: "대형 캐비닛 (2m이하)", keyword: "대형캐비닛" },
    ],
  },
  {
    // DB: 욕실 - 분리형 욕조(41K), 일체형 욕조(42K)
    patterns: ["욕조"],
    question: "욕조 종류를 선택해주세요!",
    options: [
      { label: "분리형 욕조", keyword: "분리형 욕조" },
      { label: "일체형 욕조", keyword: "일체형 욕조" },
    ],
  },
];

/**
 * 고객 메시지에서 모호한 품목을 감지
 * 이미 세부 사양이 명시된 경우(예: "양문형 냉장고")는 모호하지 않음
 * 수식어가 붙은 경우(예: "작은냉장고", "미니냉장고")도 모호하지 않음
 * 치수가 명시된 경우(예: "장농12자") → 크기 확정 → 모호하지 않음
 */
/**
 * 대화 기록을 분석하여 아직 질문하지 않은 다음 모호 품목을 반환
 * - 모든 user 메시지에서 모호 품목을 수집
 * - 이미 질문을 보낸 것은 스킵
 * - 질문을 보냈지만 아직 응답이 없으면 null 반환 (대기)
 * - 다음 미질문 품목 1개만 반환
 */
export function findNextPendingAmbiguousItem(
  messages: { role: string; content: string }[]
): AmbiguousItem | null {
  // 버튼 응답 메시지 인덱스 수집 (다른 그룹의 질문 직후 첫 user 메시지)
  // 이 메시지들은 ambiguous 감지 대상에서 제외 (옵션 label에 포함된 패턴 오감지 방지)
  // 예: "사이드/소파 테이블" 선택 시 "소파" 패턴이 소파 그룹을 트리거하는 것 방지
  const buttonResponseIndices = new Set<number>();
  for (const ambItem of AMBIGUOUS_ITEMS) {
    const qIdx = messages.findIndex(
      (m) => m.role === "assistant" && m.content.includes(ambItem.question)
    );
    if (qIdx === -1) continue;
    // 질문 직후 첫 user 메시지가 옵션 label과 일치하면 버튼 응답
    for (let i = qIdx + 1; i < messages.length; i++) {
      if (messages[i].role !== "user") continue;
      const userNorm = messages[i].content.replace(/\s/g, "").toLowerCase();
      const isButtonResponse = ambItem.options.some((opt) => {
        const labelNorm = opt.label.replace(/\s/g, "").toLowerCase();
        return userNorm === labelNorm || userNorm.includes(labelNorm) || labelNorm.includes(userNorm);
      });
      if (isButtonResponse) buttonResponseIndices.add(i);
      break; // 첫 user 메시지만 확인
    }
  }

  for (const item of AMBIGUOUS_ITEMS) {
    // 1. 이 품목이 대화에서 모호하게 언급된 적 있는지 확인
    //    단, 다른 메시지에서 이미 구체적으로 언급된 경우 스킵
    //    예: "슈퍼싱글침대프레임 1개" (구체적) + "침대 해체작업후" (모호) → 스킵
    let mentionedAmbiguously = false;
    let alreadySpecifiedInOtherMessage = false;
    for (let mi = 0; mi < messages.length; mi++) {
      const m = messages[mi];
      if (m.role !== "user") continue;
      // 버튼 응답 메시지는 ambiguous 감지에서 제외
      if (buttonResponseIndices.has(mi)) continue;

      const normalized = m.content.replace(/\s/g, "");
      const hasPattern = item.patterns.some((p) => normalized.includes(p));
      if (!hasPattern) continue;

      const detected = detectAmbiguousItems(m.content);
      if (detected.some((d) => d.question === item.question)) {
        mentionedAmbiguously = true;
      } else {
        // 패턴은 있지만 모호하지 않음 → 이미 구체적으로 언급됨
        alreadySpecifiedInOtherMessage = true;
      }
    }
    if (alreadySpecifiedInOtherMessage) continue;
    if (!mentionedAmbiguously) continue;

    // 2. 이미 질문을 보냈는지 확인
    const questionIdx = messages.findIndex(
      (m) => m.role === "assistant" && m.content.includes(item.question)
    );

    if (questionIdx === -1) {
      // 아직 질문 안 함 → 이 품목을 다음으로 질문
      return item;
    }

    // 3. 질문 이후 고객이 응답했는지 확인
    const afterQuestion = messages.slice(questionIdx + 1);
    const hasUserResponse = afterQuestion.some((m) => m.role === "user");

    if (!hasUserResponse) {
      // 질문 보냈는데 아직 응답 없음 → 다른 질문 보내지 말고 대기
      return null;
    }

    // 응답 완료 → 다음 품목으로 계속
  }

  return null;
}

export function detectAmbiguousItems(message: string): AmbiguousItem[] {
  const found: AmbiguousItem[] = [];
  const normalized = message.replace(/\s/g, "");

  for (const item of AMBIGUOUS_ITEMS) {
    // 패턴 중 하나라도 메시지에 포함되어야 함
    const matched = item.patterns.some((p) => normalized.includes(p));
    if (!matched) continue;

    // 이미 세부 옵션이 명시된 경우 스킵
    const alreadySpecific = item.options.some((opt) =>
      normalized.includes(opt.label.replace(/\s/g, "")) ||
      normalized.includes(opt.keyword.replace(/\s/g, ""))
    );
    if (alreadySpecific) continue;

    // 숫자+인용/인 수식어 스킵 (예: "3인용소파", "2인소파", "3인 리클라이닝 소파")
    // ⚠️ 토큰 기반 — "리클라이닝"이 끼어도 "3인"과 "소파"가 같은 문맥이면 감지
    // ⚠️ 다른 AMBIGUOUS 패턴에 인접한 수식어는 해당 패턴 것으로 판단
    //     예: "소파 3인용, 매트리스" → "3인용"은 "소파" 수식어 (매트리스 아님)
    const allPatternsForNum = AMBIGUOUS_ITEMS.flatMap((ai) => ai.patterns);
    const tokensForNum = message.split(/[\s,]+/).filter(Boolean);
    const hasNumericQualifier = item.patterns.some((p) => {
      for (let i = 0; i < tokensForNum.length; i++) {
        if (!tokensForNum[i].includes(p)) continue;
        // 현재 토큰에 숫자+인 포함 (예: "3인용소파")
        if (/\d+인(용)?/.test(tokensForNum[i])) return true;
        // 이전 토큰들(최대 3개)에서 숫자+인 검색 (예: "3인 리클라이닝 소파")
        for (let j = Math.max(0, i - 3); j < i; j++) {
          if (!/\d+인(용)?/.test(tokensForNum[j])) continue;
          // 수식어 인접 토큰에 다른 AMBIGUOUS 패턴이 있으면 해당 패턴 소유
          let belongsToOther = false;
          for (let k = Math.max(0, j - 1); k <= Math.min(tokensForNum.length - 1, j + 1); k++) {
            if (k === i || k === j) continue;
            if (allPatternsForNum.some((op) => op !== p && tokensForNum[k].includes(op))) {
              belongsToOther = true;
              break;
            }
          }
          if (!belongsToOther) return true;
        }
      }
      return false;
    });
    if (hasNumericQualifier) continue;

    // "제외"/"뺀"/"빼고"/"없이"/"받침" 등이 바로 뒤에 오면 해당 품목을 원하는 게 아님
    // (예: "매트리스제외" = 매트리스 불필요, "매트리스받침" = 프레임이지 매트리스가 아님)
    const isExclusion = item.patterns.some((p) => {
      const idx = normalized.indexOf(p);
      if (idx === -1) return false;
      const after = normalized.substring(idx + p.length, idx + p.length + 3);
      return /^(제외|뺀|빼고|없이|빼|제거|불필요|받침|깔판|옆|머리맡|의자|스툴|체어)/.test(after);
    });
    if (isExclusion) continue;

    // 사이즈/종류 수식어가 패턴 앞뒤에 있으면 이미 특정됨 → 스킵
    // 예: "퀸사이즈침대", "드럼세탁기", "이동식책상", "L자소파", "김치냉장고"
    // ⚠️ 토큰 기반 검사 — "싱글침대2 책상"에서 "싱글"이 "책상"의 수식어로 오인되는 것 방지
    const SIZE_QUALIFIERS = /퀸사이즈|퀸|킹|싱글|슈퍼싱글|수퍼싱글|더블|소형|중형|대형|양문|미니|와이드|스탠드|벽걸이|드럼|통돌이|일반|김치|좌식|입식|이동식|컴퓨터|학생|사무|전자동|접이식|접의식|철제|폴딩|플라스틱|원목|유리|대리석|스틸|안마|마사지|전동|리클라이너|L자|\d+리터|\d+L/;
    const allPatterns = AMBIGUOUS_ITEMS.flatMap((ai) => ai.patterns);
    const tokens = message.split(/[\s,]+/).filter(Boolean);
    const hasQualifier = item.patterns.some((p) => {
      for (let i = 0; i < tokens.length; i++) {
        if (!tokens[i].includes(p)) continue;

        // 현재 토큰에 수식어 포함 시: 패턴 근처에 있는지 확인
        // "퀸싸이즈침대1개옷장1개" — "퀸"은 "침대" 근처이지 "옷장" 근처가 아님
        if (SIZE_QUALIFIERS.test(tokens[i])) {
          const token = tokens[i];
          const patIdx = token.indexOf(p);
          // 패턴 앞 20자, 뒤 10자 범위 내에 수식어가 있는지 확인
          const nearStart = Math.max(0, patIdx - 20);
          const nearEnd = Math.min(token.length, patIdx + p.length + 10);
          const nearText = token.substring(nearStart, nearEnd);
          // 다른 ambiguous 패턴이 이 범위 밖에서 수식어를 가져가는 경우 제외
          const otherPatternBetween = allPatterns.some((op) => {
            if (op === p) return false;
            const opIdx = token.indexOf(op);
            if (opIdx === -1) return false;
            // 수식어가 다른 패턴과 현재 패턴 사이에 있으면 다른 패턴의 것
            const qualMatch = token.match(SIZE_QUALIFIERS);
            if (!qualMatch || qualMatch.index === undefined) return false;
            const qualIdx = qualMatch.index;
            // 수식어가 다른 패턴에 더 가까우면 현재 패턴의 것이 아님
            return Math.abs(qualIdx - opIdx) < Math.abs(qualIdx - patIdx);
          });
          if (!otherPatternBetween && SIZE_QUALIFIERS.test(nearText)) return true;
        }

        // 이전 토큰 검사 — 다른 AMBIGUOUS 패턴이 포함된 토큰이면 수식어 무효화
        // 예: "싱글침대2"(prev) + "책상"(cur) → "싱글"은 "침대"의 수식어
        if (i > 0 && SIZE_QUALIFIERS.test(tokens[i - 1])) {
          const prevHasOtherPattern = allPatterns.some(
            (op) => op !== p && tokens[i - 1].includes(op)
          );
          if (!prevHasOtherPattern) return true;
        }

        // 다음 토큰 검사 — 동일 규칙
        if (i < tokens.length - 1 && SIZE_QUALIFIERS.test(tokens[i + 1])) {
          const nextHasOtherPattern = allPatterns.some(
            (op) => op !== p && tokens[i + 1].includes(op)
          );
          if (!nextHasOtherPattern) return true;
        }
      }
      return false;
    });
    if (hasQualifier) continue;

    // 치수가 명시된 경우 스킵
    // - "자" 단위 (장롱 등): "장농12자", "12자장롱"
    // - "인치" 단위 (TV 등): "40인치티비", "50인치TV", "40인치엘이디티비"
    const hasMeasurement = item.patterns.some((p) => {
      // N자 패턴
      if (new RegExp(p + "\\d+자").test(normalized) ||
          new RegExp("\\d+자" + p).test(normalized)) return true;
      // N인치 패턴 — 패턴 앞 10글자 이내에 "N인치"가 있으면 이미 크기 확정
      const idx = normalized.indexOf(p);
      if (idx > 0) {
        const before = normalized.substring(Math.max(0, idx - 10), idx);
        if (/\d+인치/.test(before)) return true;
      }
      return false;
    });
    if (hasMeasurement) continue;

    found.push(item);
  }

  return found;
}
