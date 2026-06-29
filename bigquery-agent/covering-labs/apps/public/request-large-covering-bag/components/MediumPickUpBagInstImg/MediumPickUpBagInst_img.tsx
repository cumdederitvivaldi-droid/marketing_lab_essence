import GoToProductPage from "../GoToProductPage1/GoToProductPage1";

function Frame() {
  return (
    <div className="relative self-stretch shrink-0">
      <div className="content-stretch flex items-start pt-[9px] relative size-full">
        <div className="relative shrink-0 size-[4px]">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 4 4">
            <circle cx="2" cy="2" fill="var(--fill-0, #434A56)" id="Ellipse 1" r="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Frame1() {
  return (
    <div className="relative self-stretch shrink-0">
      <div className="content-stretch flex items-start pt-[9px] relative size-full">
        <div className="relative shrink-0 size-[4px]">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 4 4">
            <circle cx="2" cy="2" fill="var(--fill-0, #434A56)" id="Ellipse 1" r="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Frame2() {
  return (
    <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full">
      <div className="content-stretch flex gap-[8px] items-start relative shrink-0 w-full" data-name="Message Item">
        <Frame />
        <p className="font-['Pretendard',sans-serif] font-semibold leading-[0] not-italic relative shrink-0 text-[#434a56] text-[14px] whitespace-nowrap">
          <span className="leading-[22px]">{`대형 봉투는 `}</span>
          <span className="leading-[22px] text-[#008ae5]">{`1장을 `}</span>
          <span className="leading-[22px] text-[#008ae5]">무료 제공</span>
          <span className="leading-[22px]">해요</span>
        </p>
      </div>
      <div className="content-stretch flex gap-[8px] items-start relative shrink-0 w-full" data-name="Message Item">
        <Frame1 />
        <p className="font-['Pretendard',sans-serif] font-semibold leading-[22px] not-italic relative shrink-0 text-[#434a56] text-[14px] whitespace-nowrap">봉투는 영업일 기준 1~2일 이내 배송돼요</p>
      </div>
    </div>
  );
}

function InstructionSectionContainer() {
  return (
    <div className="bg-white relative rounded-[16px] shrink-0 w-full" data-name="InstructionSection_container">
      <div className="flex flex-col items-center justify-center size-full">
        <div className="content-stretch flex flex-col items-center justify-center p-[16px] relative size-full">
          <Frame2 />
        </div>
      </div>
    </div>
  );
}

export default function MediumPickUpBagInst_img() {
  return (
    <div className="bg-[#eef2f6] content-stretch flex flex-col gap-[8px] items-center justify-center p-[16px] relative shrink-0 w-full" data-name="MediumPickUpBagInst_img">
      <div className="h-[160px] overflow-clip relative shrink-0 w-full">
        <GoToProductPage />
      </div>
      <InstructionSectionContainer />
    </div>
  );
}
