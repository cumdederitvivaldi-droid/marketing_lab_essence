'use client';

import Image from 'next/image';
import UnavailableAreaTitle from './UnavailableAreaTitle';
import CollectionAccordion from './CollectionAccordion';

interface CollectionDay {
  city: string;
  days: string | string[];
  isNew?: boolean;
}

const COLLECTION_DAYS: CollectionDay[] = [
  { city: '천안시', days: '매일', isNew: true },
  { city: '아산시', days: '매일', isNew: true },
  { city: '세종시', days: ['화', '금', '일'] },
  { city: '청주시 상당구 · 서원구', days: ['월', '수', '금', '일'] },
  { city: '청주시 흥덕구', days: ['화', '금', '일'] },
  { city: '청주시 청원구', days: ['월', '목', '토'] },
  { city: '대전광역시 서구 · 중구', days: ['화', '목', '토', '일'] },
  { city: '대전광역시 유성구', days: ['월', '수', '금', '일'] },
  { city: '대전광역시 동구 · 대덕구', days: ['월', '수', '목', '토'] },
];

const UNAVAILABLE = [
  { city: '천안시', value: '성환읍, 입장면, 북면, 병천면, 동면, 수신면, 성남면, 목천읍, 풍세면, 광덕면' },
  { city: '아산시', value: '둔포면, 음봉면, 영인면, 인주면, 염치읍, 선장면, 도고면, 송악면' },
  { city: '세종시', value: '소정면, 전의면, 전동면, 연서면, 장군면, 금남면, 부강면, 연기면' },
  {
    city: '청주시',
    details: [
      { label: '상당구:', value: '낭성면, 미원면, 가덕면, 남일면, 문의면' },
      { label: '서원구:', value: '남이면, 현도면' },
      { label: '흥덕구:', value: '옥산면' },
      { label: '청원구:', value: '내수읍, 북이면' },
    ],
  },
  {
    city: '대전광역시',
    details: [
      { label: '서구:', value: '기성동' },
      { label: '유성구:', value: '진잠동' },
      { label: '동구:', value: '대청동, 산내동' },
      { label: '중구:', value: '산성동' },
    ],
  },
];

export default function Chungcheong() {
  return (
    <div className="relative w-full">
      <div className="flex flex-col w-full">
        <div className="bg-white content-stretch flex items-center pb-[8px] pt-[24px] px-[20px] w-full">
          <p className="font-sans font-semibold leading-[26px] not-italic relative shrink-0 text-[#16191d] text-[18px] text-nowrap">
            서비스 이용 가능 지역
          </p>
        </div>

        <div className="relative bg-white w-full overflow-clip">
          <Image src="/images/map-chungcheong.png" alt="충청도 서비스 지역 지도" width={767} height={600} className="w-full h-auto" />
        </div>

        <CollectionAccordion>
          <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            {COLLECTION_DAYS.map((item, idx, arr) => (
                        <div key={item.city}>
                          <div className="content-stretch flex flex-col gap-[2px] items-start justify-center not-italic relative shrink-0 w-full">
                            {item.isNew && (
                              <p className="font-sans font-semibold leading-[14px] relative shrink-0 text-[#ff3358] text-[11px] tracking-[0.066px]">New</p>
                            )}
                            <div className="content-stretch flex gap-[8px] items-center justify-center leading-[22px] relative shrink-0 text-[14px] w-full">
                              <p className="basis-0 font-sans font-normal grow min-h-px min-w-px relative shrink-0 text-[#16191d]">{item.city}</p>
                              {item.days === '매일' ? (
                                <p className="font-sans font-semibold relative shrink-0 text-[#008ae5] text-center whitespace-nowrap">매일</p>
                              ) : (
                                <div className="content-stretch flex font-sans font-semibold gap-[4px] items-center leading-[22px] not-italic relative shrink-0 text-[#008ae5] text-[14px] text-center">
                                  {(item.days as string[]).map((day) => (
                                    <p key={day} className="relative shrink-0 w-[18px]">{day}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          {idx < arr.length - 1 && <div className="bg-[#eef2f6] h-px shrink-0 w-full mt-[16px]" />}
                        </div>
                      ))}
          </div>
        </CollectionAccordion>

        <div className="bg-[#f8fafb] content-stretch flex flex-col items-start pb-[64px] pt-[24px] px-[20px] w-full">
          <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            <UnavailableAreaTitle />
            <div className="bg-[#eef2f6] h-px shrink-0 w-full" />

            <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full">
              {UNAVAILABLE.map((item) => (
                <div key={item.city} className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0 w-full">
                  <p className="font-sans font-semibold leading-[24px] not-italic relative shrink-0 text-[#16191d] text-[16px]">{item.city}</p>
                  {item.details ? (
                    <div className="content-stretch flex flex-col gap-[2px] items-start leading-[22px] not-italic relative shrink-0 text-[#434a56] text-[14px] w-full">
                      {item.details.map((d) => (
                        <div key={d.label} className="content-stretch flex gap-[2px] items-start relative shrink-0 w-full">
                          <p className="font-sans font-semibold relative shrink-0">{d.label}</p>
                          <p className="font-sans font-normal relative shrink-0">{d.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-sans font-normal leading-[22px] not-italic relative shrink-0 text-[#434a56] text-[14px] w-full break-keep">{item.value}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-[#eef2f6] relative rounded-[8px] shrink-0 w-full p-[8px] text-center">
              <p className="font-sans font-semibold leading-[22px] text-[#434a56] text-[14px]">해당 지역들도 커버링이 함께할 예정이에요</p>
              <p className="font-sans font-semibold leading-[22px] text-[#434a56] text-[14px]">조금만 기다려주세요!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
