import { useEffect } from 'react';
import { track } from '../lib/analytics';
import { assetUrl } from '../lib/path';

interface CompleteProps {
  onHome: () => void;
}

const NOTES = [
  '한 봉투당 25kg 미만으로 담아주세요.',
  '현재 베타 테스트 기간으로 무료 제공되고 있습니다.',
  '본 서비스는 별도 공지 없이 종료될 수 있습니다.',
  '대형 봉투는 시범 운행 중(BETA)이라 제공되는 실제 디자인이 이미지와 다를 수 있습니다.',
  '봉투는 영업일 기준 3~4일 이내 배송됩니다.',
];
const COMPLETE_TRACKING_PROPS = {
  funnel_name: 'large_coveringbag_order',
  product_code: 'LARGE_COVERING_BAG',
  product_volume_l: 220,
  screen_name: 'ProductPurchaseCompleteScreen',
};

export default function Complete({ onHome }: CompleteProps) {
  useEffect(() => {
    track('[ROUTE] ProductPurchaseCompleteScreen', {
      ...COMPLETE_TRACKING_PROPS,
      funnel_step: 'complete_view',
    });
  }, []);

  const handleHomeClick = () => {
    onHome();
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#eef2f6]">
      {/* 체크 아이콘 + 완료 텍스트 — 남은 공간 차지하며 중앙 배치 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-[16px] px-[20px]">
        <div
          className="flex items-center justify-center overflow-clip relative rounded-[8px] shrink-0"
          style={{ animation: 'check-bounce 0.6s ease-out forwards' }}
        >
          <div className="overflow-clip relative shrink-0 size-[80px]">
            <div className="absolute inset-[6.25%]">
              <img alt="" className="absolute block max-w-none size-full" src={assetUrl('/assets/figma/check-circle.svg')} />
            </div>
          </div>
        </div>
        <div
          className="flex flex-col gap-[4px] items-start not-italic relative shrink-0 text-center w-[180px]"
          style={{ animation: 'check-text 0.4s ease-out 0.3s forwards', opacity: 0 }}
        >
          <p className="font-semibold leading-[26px] relative shrink-0 text-[18px] text-[#16191d] w-full">
            신청 완료
          </p>
          <div className="flex flex-col justify-center leading-[0] relative shrink-0 text-[16px] text-[#5c6575] w-full">
            <p className="leading-[24px] whitespace-pre-wrap">
              {'봉투가 배송 완료되고 나서 '}
              <br aria-hidden="true" />
              수거 신청을 하실 수 있어요
            </p>
          </div>
        </div>
      </div>

      {/* 유의사항 섹션 */}
      <div className="flex flex-col gap-[8px] items-start px-[20px] py-[32px]">
        <p className="font-['Pretendard'] font-semibold text-[14px] leading-[22px] text-[#5c6575]">
          유의사항
        </p>
        <div className="bg-[#f8fafb] flex flex-col gap-[4px] items-start p-[16px] rounded-[12px] w-full">
          {NOTES.map((text, i) => (
            <div key={i} className="flex gap-[8px] items-start w-full">
              <div className="flex items-start pt-[9px] shrink-0">
                <div className="w-1 h-1 rounded-full bg-[#434a56] shrink-0" />
              </div>
              <p className="font-['Pretendard'] text-[14px] leading-[22px] text-[#434a56]">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 홈으로 버튼 */}
      <div
        className="w-full flex gap-0 items-start justify-center px-[20px] py-[8px]"
        style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={handleHomeClick}
          className="bg-[#1AA3FF] flex flex-1 gap-[6px] items-center justify-center min-h-[50px] min-w-px px-[20px] relative rounded-[8px] cursor-pointer active:bg-[#1490E6]"
        >
          <span className="font-semibold text-[18px] leading-[26px] text-white text-center whitespace-nowrap">
            홈으로
          </span>
        </button>
      </div>
    </div>
  );
}
