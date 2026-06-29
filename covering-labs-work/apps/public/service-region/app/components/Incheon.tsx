'use client';

import Image from 'next/image';
import UnavailableAreaTitle from './UnavailableAreaTitle';
import CollectionAccordion from './CollectionAccordion';

export default function Incheon() {
  return (
    <div className="relative w-full">
      <div className="flex flex-col w-full">
        <div className="bg-white content-stretch flex items-center pb-[8px] pt-[24px] px-[20px] w-full">
          <p className="font-sans font-semibold leading-[26px] not-italic relative shrink-0 text-[#16191d] text-[18px] text-nowrap">
            서비스 이용 가능 지역
          </p>
        </div>

        <div className="relative bg-white w-full overflow-clip">
          <Image src="/images/map-incheon.png" alt="인천 서비스 지역 지도" width={767} height={600} className="w-full h-auto" />
        </div>

        <CollectionAccordion>
          <div className="content-stretch flex gap-[8px] items-center justify-center leading-[22px] not-italic relative shrink-0 text-[14px] w-full">
            <p className="basis-0 font-sans font-normal grow min-h-px min-w-px relative shrink-0 text-[#16191d]">
              미추홀구 · 남동구 · 연수구<br />
              중구 · 동구 · 서구 · 부평구 · 계양구
            </p>
            <p className="font-sans font-semibold relative shrink-0 text-[#008ae5] text-center text-nowrap">매일</p>
          </div>
        </CollectionAccordion>

        <div className="bg-[#f8fafb] content-stretch flex flex-col items-start pb-[64px] pt-[24px] px-[20px] w-full">
          <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full">
            <UnavailableAreaTitle />
            <div className="bg-[#eef2f6] h-px shrink-0 w-full" />

            <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full">
              {[
                { city: '서구', value: '신현원창동 (섬 지역)' },
                { city: '중구', value: '용유동' },
                { city: '강화군, 옹진군', value: '전 지역' },
              ].map((item) => (
                <div key={item.city} className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0 w-full">
                  <p className="font-sans font-semibold leading-[24px] not-italic relative shrink-0 text-[#16191d] text-[16px]">{item.city}</p>
                  <p className="font-sans font-normal leading-[22px] not-italic relative shrink-0 text-[#434a56] text-[14px] w-full">{item.value}</p>
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
