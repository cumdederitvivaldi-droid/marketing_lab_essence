import MediumPickUpBagInst_img from "./MediumPickUpBagInst_img";

function Contents() {
  return (
    <div className="content-stretch flex flex-col gap-[4px] items-start justify-center leading-[0] not-italic relative shrink-0 text-center w-full" data-name="Contents">
      <p className="font-['Pretendard',sans-serif] font-semibold relative shrink-0 text-[#16191d] text-[18px] w-full">
        <span className="leading-[26px] text-[#008ae5]">대형 커버링 봉투(220L)</span>
        <span className="leading-[26px]">가 필요해요</span>
      </p>
      <div className="flex flex-col font-['Pretendard',sans-serif] justify-center relative shrink-0 text-[#5c6575] text-[16px] w-full">
        <p className="leading-[24px]">봉투를 먼저 신청하고 진행해주세요</p>
      </div>
    </div>
  );
}

export default function MediumPickUpBagInstImg() {
  return (
    <div className="content-stretch flex flex-col gap-[8px] items-center justify-center relative w-full" data-name="MediumPickUpBagInst_img">
      <Contents />
      <MediumPickUpBagInst_img />
    </div>
  );
}
