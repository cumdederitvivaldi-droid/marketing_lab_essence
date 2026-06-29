'use client';

import Image from 'next/image';
import UnavailableAreaTitle from './UnavailableAreaTitle';
import CollectionAccordion from './CollectionAccordion';

interface UnavailableDetail {
  value: string;
  label?: string;
  bold?: boolean;
}

interface UnavailableArea {
  city: string;
  details: UnavailableDetail[];
}

const COLLECTION_DAYS = [
  { city: '파주시', days: ['월', '화', '목', '금', '일'] },
  { city: '광주시', days: ['화', '목', '토', '일'] },
  { city: '평택시', days: ['월', '수', '목', '토', '일'] },
  { city: '안성시', days: ['화', '금', '일'] },
];

const UNAVAILABLE_AREAS: UnavailableArea[] = [
  {
    city: '고양시',
    details: [
      { label: '일산동구:', value: '고봉동' },
      { label: '일산서구:', value: '가좌동' },
      { label: '덕양구:', value: '효자동, 고양동, 관산동' },
    ],
  },
  { city: '광주시', details: [{ value: '남종면, 남한산성면, 퇴촌면, 초월읍, 곤지암읍, 도척면' }] },
  { city: '김포시', details: [{ value: '월곶면, 하성면, 통진읍, 대곶면' }] },
  { city: '남양주시', details: [{ value: '와부읍, 진건읍, 진접읍, 오남읍, 화도읍, 별내면, 수동면, 조안면, 양정동' }] },
  { city: '안산시', details: [{ value: '대부동' }] },
  { city: '안성시', details: [{ value: '양성면, 고삼면, 원곡면, 보개면, 삼죽면, 죽산면, 일죽면, 금광면, 서운면, 미얀면' }] },
  {
    city: '용인시',
    details: [
      { value: '처인구 일부지역', bold: true },
      { value: '동부동, 포곡읍, 모현읍, 이동읍, 남사읍, 양지읍, 백암면, 원삼면' },
    ],
  },
  { city: '화성시', details: [{ value: '송산면, 서신면, 마도면, 남양읍, 비봉면, 새솔동, 매송면, 팔탄면, 우정읍, 장안면, 향남읍, 양감면, 정남면' }] },
  { city: '파주시', details: [{ value: '문산읍, 법원읍, 파주읍, 광탄면, 월롱면, 적성면, 파평면, 군내면, 장단면, 진동면, 진서면, 조리읍, 탄현면' }] },
  { city: '평택시', details: [{ value: '서탄면, 진위면, 고덕면, 팽성읍, 청북읍, 포승읍, 안중읍, 오성면, 현덕면' }] },
];

export default function Gyeonggi() {
  return (
    <div className="relative w-full">
      <div className="flex flex-col w-full">
        <div className="bg-white content-stretch flex items-center pb-[8px] pt-[24px] px-[20px] w-full">
          <p className="font-sans font-semibold leading-[26px] not-italic relative shrink-0 text-[#16191d] text-[18px] text-nowrap">
            서비스 이용 가능 지역
          </p>
        </div>

        <div className="relative bg-white w-full overflow-clip">
          <Image src="/images/map-gyeonggi.png" alt="경기도 서비스 지역 지도" width={767} height={600} className="w-full h-auto" />
        </div>

        <CollectionAccordion>
          <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full">

                      <div className="content-stretch flex flex-col gap-[2px] items-start justify-center not-italic relative shrink-0 w-full">
                        <p className="font-sans font-semibold leading-[14px] relative shrink-0 text-[#ff3358] text-[11px] tracking-[0.066px]">New</p>
                        <div className="content-stretch flex gap-[8px] items-center justify-center leading-[22px] not-italic relative shrink-0 text-[14px] w-full">
                          <p className="basis-0 font-sans font-normal grow min-h-px min-w-px relative shrink-0 text-[#16191d]">
                            고양시 · 구리시 · 군포시 · 과천시 · 광명시<br />
                            김포시 · 남양주시 · 부천시 · 성남시 · 수원시<br />
                            시흥시 · 안산시 · 안양시 · 오산시 · 용인시<br />
                            의왕시 · 의정부시 · 하남시 · 화성시
                          </p>
                          <p className="font-sans font-semibold relative shrink-0 text-[#008ae5] text-center text-nowrap">매일</p>
                        </div>
                      </div>

                      <div className="bg-[#eef2f6] h-px shrink-0 w-full" />

                      {COLLECTION_DAYS.map((item, idx, arr) => (
                        <div key={item.city}>
                          <div className="content-stretch flex items-center relative shrink-0 w-full">
                            <p className="basis-0 font-sans font-normal grow leading-[22px] min-h-px min-w-px not-italic relative shrink-0 text-[#16191d] text-[14px]">
                              {item.city}
                            </p>
                            <div className="content-stretch flex font-sans font-semibold gap-[4px] items-center leading-[22px] not-italic relative shrink-0 text-[#008ae5] text-[14px] text-center">
                              {item.days.map((day) => (
                                <p key={day} className="relative shrink-0 w-[18px]">{day}</p>
                              ))}
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
              {UNAVAILABLE_AREAS.map((item) => (
                <div key={item.city} className="content-stretch flex flex-col gap-[4px] items-start justify-center relative shrink-0 w-full">
                  <p className="font-sans font-semibold leading-[24px] not-italic relative shrink-0 text-[#16191d] text-[16px]">{item.city}</p>
                  <div className="content-stretch flex flex-col gap-[2px] items-start relative shrink-0 w-full">
                    {item.details.map((d, i) => (
                      <div key={i} className="content-stretch flex gap-[2px] items-start leading-[22px] not-italic relative shrink-0 text-[#434a56] text-[14px]">
                        {d.label && <p className="font-sans font-semibold relative shrink-0">{d.label}</p>}
                        <p className={`font-sans relative shrink-0 break-keep ${d.bold ? 'font-bold' : 'font-normal'}`}>{d.value}</p>
                      </div>
                    ))}
                  </div>
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
