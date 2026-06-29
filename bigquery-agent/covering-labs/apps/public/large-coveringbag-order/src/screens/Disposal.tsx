import { useState } from 'react'
import { assetUrl } from '../lib/path'

interface DisposalProps {
  onBack: () => void
}

const FAQ_ITEMS = [
  {
    q: '왜 대형 폐기물은 봉투가 필수인가요?',
    a: '커버링 서비스의 자원 재활용 시스템과 수거 기준을 맞추기 위해 대형 커버링 봉투(150L) 사용이 필수입니다. 봉투 없이는 수거가 어렵습니다.',
  },
  {
    q: '왜 오후 10시까지 배출해야하나요?',
    a: '수거 기사님이 오후 10시 이후에 순서대로 수거를 진행합니다. 10시 이전에 배출해 주셔야 당일 수거가 가능합니다.',
  },
  {
    q: '대형폐기물을 봉투를 사용해서 이사 쓰레기를 버리고 싶어요',
    a: '이사 쓰레기도 대형 커버링 봉투(150L)에 담아 배출하시면 수거 가능합니다. 앱에서 봉투를 받으신 후 사용해 주세요.',
  },
  {
    q: '어떤 품목을 담으면 되나요?',
    a: '일반 쓰레기봉투에 담기지 않는 부피가 큰 생활 폐기물을 담으실 수 있어요. 단, 음식물, 가전제품, 위험물은 제외됩니다.',
  },
  {
    q: '수거해서 어떻게 되나요?',
    a: '수거된 폐기물은 분류 후 재활용 가능한 것은 재활용하고, 나머지는 친환경적인 방법으로 처리됩니다.',
  },
]

const segments = ['쓰레기 봉투', '대형 폐기물', '박스'] as const
const ACTIVE_SEGMENT = '대형 폐기물'

export default function Disposal({ onBack }: DisposalProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div data-name="Disposal" className="flex flex-col min-h-screen bg-white">
      {/* 헤더 */}
      <header className="sticky top-0 z-[10] flex items-center h-[56px] px-[16px] bg-white border-b-[1px] border-[#EEF2F6]">
        <button onClick={onBack} className="w-[32px] h-[32px] flex items-center justify-center" aria-label="뒤로">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="#16191D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="flex-[1_0_0] text-center text-[16px] font-bold text-[#16191D]">배출방법</h1>
        <div className="w-[32px]" />
      </header>

      {/* 세그먼트 컨트롤 */}
      <div className="px-[16px] py-[12px] bg-white border-b-[1px] border-[#EEF2F6]">
        <div className="flex bg-[#EEF2F6] rounded-[20px] p-[3px]">
          {segments.map(seg => (
            <button
              key={seg}
              type="button"
              disabled={seg !== ACTIVE_SEGMENT}
              aria-pressed={seg === ACTIVE_SEGMENT}
              className={`flex-[1_0_0] py-[8px] text-[13px] leading-[18px] font-semibold rounded-[17px] transition-all ${
                seg === ACTIVE_SEGMENT
                  ? 'bg-white text-[#16191D] shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                  : 'text-[#73787E]'
              } ${seg !== ACTIVE_SEGMENT ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {seg}
            </button>
          ))}
        </div>
        {/* TODO: 세그먼트별 콘텐츠 분기 구현 전까지 대형 폐기물 안내만 노출 */}
        <p className="mt-[8px] text-[12px] leading-[16px] text-[#73787E]">
          현재 이 화면은 대형 폐기물 배출 안내만 제공 중입니다.
        </p>
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-[1_0_0] overflow-y-auto">
        {/* 히어로 배너 */}
        <section data-name="HeroBanner" className="bg-[#E5F4FF] px-[20px] pt-[24px] pb-[32px]">
          <p className="text-[14px] leading-[20px] text-[#73787E]">기존 봉투에 담기지 않는 쓰레기는</p>
          <h2 className="mt-[4px] text-[20px] leading-[28px] font-bold text-[#16191D]">대형 커버링 봉투</h2>
          <div className="mt-[20px] flex justify-center">
            <img src={assetUrl('/assets/bag-220l.svg')} alt="220L" className="h-[120px]" />
          </div>
        </section>

        {/* 배출 안내 */}
        <section data-name="DisposalGuide" className="px-[20px] py-[24px]">
          <h3 className="text-[16px] leading-[24px] font-bold text-[#16191D]">
            아래 봉투에 쓰레기를 담아<br />
            <span className="text-[#008AE5]">오후 10시 전</span>, 문밖으로 배출해 주세요
          </h3>

          {/* 봉투 카드 */}
          <div className="mt-[16px] rounded-[12px] border-[1px] border-[#EEF2F6] p-[16px] flex flex-col items-center">
            <img src={assetUrl('/assets/bag-150l.svg')} alt="150L" className="h-[60px]" />
            <p className="mt-[8px] text-[14px] leading-[20px] font-semibold text-[#16191D]">대형 커버링 봉투</p>
            <p className="text-[12px] leading-[16px] text-[#73787E]">(150L)</p>
            <span className="mt-[8px] px-[12px] py-[4px] rounded-[4px] bg-[#FF3358] text-white text-[12px] leading-[16px] font-bold">필수</span>
          </div>
        </section>

        <div className="h-[8px] bg-[#EEF2F6]" />

        {/* 앱 유도 */}
        <section data-name="AppPromo" className="px-[20px] py-[24px]">
          <h3 className="text-[16px] leading-[24px] font-bold text-[#16191D]">
            대형 커버링 봉투는 커버링 앱에서<br />
            <span className="text-[#008AE5]">무료로 받을 수 있어요</span>
          </h3>

          {/* 앱 미리보기 */}
          <div className="mt-[16px] rounded-[12px] bg-[#F5F7FA] p-[16px] flex justify-center">
            <img src={assetUrl('/assets/app-preview.svg')} alt="앱 미리보기" className="w-full rounded-[8px]" />
          </div>

          {/* 봉투담기 링크 */}
          <div className="mt-[12px] flex items-center justify-between rounded-[12px] border-[1px] border-[#EEF2F6] px-[16px] py-[12px]">
            <div className="flex items-center gap-[8px]">
              <img src={assetUrl('/assets/bag-icon.svg')} alt="" className="w-[24px] h-[24px]" />
              <span className="text-[14px] leading-[20px] font-semibold text-[#16191D]">봉투담기</span>
            </div>
            <div className="flex items-center gap-[8px]">
              <span className="px-[8px] py-[2px] rounded-[4px] bg-[#FF3358] text-white text-[10px] leading-[14px] font-bold">수거 무료</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="#434A56" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* 경로 안내 */}
          <div className="mt-[16px] flex items-center gap-[4px] text-[12px] leading-[16px] text-[#73787E]">
            <span>홈</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 3L7.5 6L4.5 9" stroke="#A0A5AB" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>봉투신청</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 3L7.5 6L4.5 9" stroke="#A0A5AB" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="text-[#008AE5]">대형 폐기물 봉투 (150L) 선택</span>
          </div>
        </section>

        <div className="h-[8px] bg-[#EEF2F6]" />

        {/* 유의사항 */}
        <section data-name="Precautions" className="px-[20px] py-[24px]">
          <h3 className="text-[16px] leading-[24px] font-bold text-[#16191D]">아래 유의사항을 꼭 지켜주세요</h3>
          <p className="mt-[4px] text-[14px] leading-[20px] text-[#FF3358]">지키지 않을 경우 수거할 수 없어요</p>

          <div className="mt-[16px] flex flex-col gap-[12px]">
            {/* 규칙 1: 봉투 사용 필수 */}
            <div className="flex items-start gap-[12px] rounded-[12px] bg-[#E5F4FF] p-[16px]">
              <img src={assetUrl('/assets/bag-icon.svg')} alt="" className="w-[24px] h-[24px] shrink-0" />
              <div>
                <p className="text-[12px] leading-[16px] text-[#FF3358] font-bold">필수! 없으면 봉투 신청부터</p>
                <p className="mt-[2px] text-[14px] leading-[20px] font-semibold text-[#16191D]">꼭 대형 커버링 봉투를 사용하기</p>
              </div>
            </div>

            {/* 규칙 2: 음식물 분리 */}
            <div className="flex items-start gap-[12px] rounded-[12px] bg-[#E5F4FF] p-[16px]">
              <img src={assetUrl('/assets/icon-food.svg')} alt="" className="w-[24px] h-[24px] shrink-0" />
              <div>
                <p className="text-[12px] leading-[16px] text-[#434A56]">대형 폐기물의 자원 재활용을 위해</p>
                <p className="mt-[2px] text-[14px] leading-[20px] font-semibold text-[#16191D]">음식물은 일반 커버링 봉투로 담기</p>
              </div>
            </div>

            {/* 규칙 3: 손잡이 묶기 + 수거 가능/불가능 */}
            <div className="rounded-[12px] bg-[#E5F4FF] p-[16px]">
              <div className="flex items-start gap-[12px]">
                <img src={assetUrl('/assets/icon-tie.svg')} alt="" className="w-[24px] h-[24px] shrink-0" />
                <div>
                  <p className="text-[12px] leading-[16px] text-[#434A56]">반절 이상 담기는 폐기물만</p>
                  <p className="mt-[2px] text-[14px] leading-[20px] font-semibold text-[#16191D]">봉투에 담아서 손잡이 꼭 묶기</p>
                </div>
              </div>

              <div className="mt-[16px] flex gap-[8px]">
                <div className="flex-[1_0_0] flex flex-col items-center rounded-[8px] bg-white p-[12px]">
                  <img src={assetUrl('/assets/collect-impossible.svg')} alt="수거 불가능" className="h-[60px]" />
                  <p className="mt-[8px] text-[11px] leading-[14px] text-[#FF3358]">수거 불가능</p>
                </div>
                <div className="flex-[1_0_0] flex flex-col items-center rounded-[8px] bg-white p-[12px]">
                  <img src={assetUrl('/assets/collect-bag-only.svg')} alt="커버링 봉투" className="h-[60px]" />
                  <p className="mt-[8px] text-[11px] leading-[14px] text-[#008AE5]">커버링 봉투</p>
                </div>
                <div className="flex-[1_0_0] flex flex-col items-center rounded-[8px] bg-white p-[12px]">
                  <img src={assetUrl('/assets/collect-possible.svg')} alt="수거 가능" className="h-[60px]" />
                  <p className="mt-[8px] text-[11px] leading-[14px] text-[#008AE5]">수거 가능</p>
                </div>
              </div>

              <div className="mt-[12px] flex flex-col gap-[4px]">
                <div className="flex items-start gap-[6px]">
                  <span className="mt-[6px] w-[4px] h-[4px] rounded-full bg-[#434A56] shrink-0" />
                  <p className="text-[12px] leading-[16px] text-[#434A56]">길이가 긴 물건도 봉투에 들어가면 수거할 수 있어요</p>
                </div>
                <div className="flex items-start gap-[6px]">
                  <span className="mt-[6px] w-[4px] h-[4px] rounded-full bg-[#434A56] shrink-0" />
                  <p className="text-[12px] leading-[16px] text-[#434A56]">물건이 봉투에 반절 이상 담겨야 해요</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="h-[8px] bg-[#EEF2F6]" />

        {/* 무게 제한 */}
        <section data-name="WeightLimit" className="px-[20px] py-[24px]">
          <div className="flex items-center gap-[16px] rounded-[12px] bg-[#F5F7FA] p-[20px]">
            <img src={assetUrl('/assets/icon-weight.svg')} alt="25kg" className="w-[60px] h-[60px] shrink-0" />
            <div>
              <p className="text-[14px] leading-[20px] font-semibold text-[#16191D]">한 봉투당 25kg 미만으로 담기</p>
              <p className="mt-[4px] text-[12px] leading-[16px] text-[#434A56]">봉투가 찢어질 수 있으니 25kg 미만으로 담아주세요</p>
            </div>
          </div>
        </section>

        <div className="h-[8px] bg-[#EEF2F6]" />

        {/* FAQ */}
        <section data-name="FAQ" className="px-[20px] py-[24px]">
          <h3 className="text-[16px] leading-[24px] font-bold text-[#16191D]">자주 묻는 질문</h3>
          <div className="mt-[16px] flex flex-col gap-[8px]">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="rounded-[12px] border-[1px] border-[#EEF2F6] overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-[16px] py-[16px] text-left"
                >
                  <span className="text-[14px] leading-[20px] font-medium text-[#16191D] pr-[16px]">{item.q}</span>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={`shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}>
                    <path d="M5 8L10 13L15 8" stroke="#73787E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-[16px] pb-[16px]">
                    <p className="text-[13px] leading-[20px] text-[#73787E]">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 하단 버튼 */}
        <section data-name="BottomActions" className="px-[20px] pb-[32px]">
          {/* TODO: FAQ 전체 페이지 연결 구현 */}
          <button
            type="button"
            disabled
            className="w-full h-[48px] rounded-[12px] border-[1px] border-[#008AE5] text-[#008AE5] font-semibold text-[14px] leading-[20px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            자주보는 질문 더 보기
          </button>
          {/* TODO: 앱 다운로드 딥링크 연결 구현 */}
          <button
            type="button"
            disabled
            className="mt-[8px] w-full h-[48px] rounded-[12px] bg-[#008AE5] text-white font-semibold text-[14px] leading-[20px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            커버링 앱 다운로드
          </button>
        </section>
      </div>
    </div>
  )
}
