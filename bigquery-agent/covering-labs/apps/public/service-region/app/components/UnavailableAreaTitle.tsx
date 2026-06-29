const INFO_CIRCLE_PATH = "M8.33333 0C3.73333 0 0 3.73333 0 8.33333C0 12.9333 3.73333 16.6667 8.33333 16.6667C12.9333 16.6667 16.6667 12.9333 16.6667 8.33333C16.6667 3.73333 12.9333 0 8.33333 0ZM8.33333 12.5C7.875 12.5 7.5 12.125 7.5 11.6667V8.33333C7.5 7.875 7.875 7.5 8.33333 7.5C8.79167 7.5 9.16667 7.875 9.16667 8.33333V11.6667C9.16667 12.125 8.79167 12.5 8.33333 12.5ZM9.16667 5.83333H7.5V4.16667H9.16667V5.83333Z";

export default function UnavailableAreaTitle() {
  return (
    <div className="content-stretch flex gap-[4px] items-center justify-center relative shrink-0">
      <div className="overflow-clip relative shrink-0 size-[20px]">
        <div className="absolute inset-[8.33%]">
          <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16.6667 16.6667">
            <path d={INFO_CIRCLE_PATH} fill="#FF3358" />
          </svg>
        </div>
      </div>
      <p className="font-sans font-semibold leading-[22px] not-italic relative shrink-0 text-[#434a56] text-[14px] whitespace-nowrap">
        서비스 이용불가 지역
      </p>
    </div>
  );
}
