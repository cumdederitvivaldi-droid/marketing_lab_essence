"use client";

interface ReferralRouteStateProps {
  banner: string;
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export default function ReferralRouteState({
  banner,
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: ReferralRouteStateProps) {
  return (
    <div className="bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-white text-[#434A56]">
        <div className="flex h-[38px] items-center justify-center bg-[#1AA3FF] px-[12px]">
          <p className="text-center text-[14px] font-semibold leading-[22px] text-white">{banner}</p>
        </div>

        <div className="flex flex-1 flex-col bg-[linear-gradient(180deg,#E5F4FF_0%,#F7FBFF_51.86%,#FFFFFF_100%)] px-[18px] pb-[24px] pt-[36px]">
          <div className="rounded-[28px] bg-white px-[24px] py-[28px] shadow-[0_20px_48px_rgba(26,163,255,0.12)]">
            <div className="flex size-[56px] items-center justify-center rounded-full bg-[#E5F4FF]">
              <span className="text-[28px] font-bold leading-none text-[#1AA3FF]">!</span>
            </div>

            <div className="mt-[20px] flex flex-col gap-[8px]">
              <h1 className="m-0 text-[28px] font-semibold leading-[39px] text-[#2D3139]">{title}</h1>
              <p className="m-0 whitespace-pre-line text-[16px] leading-[24px] text-[#5C6575]">{description}</p>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-[8px] pt-[16px]">
            <button
              type="button"
              onClick={onPrimary}
              className="min-h-[50px] w-full rounded-[8px] bg-[#1AA3FF] px-[20px] text-[18px] font-semibold leading-[26px] text-white active:bg-[#1490E6]"
            >
              {primaryLabel}
            </button>

            {secondaryLabel ? (
              <button
                type="button"
                onClick={onSecondary}
                className="min-h-[50px] w-full rounded-[8px] bg-white px-[20px] text-[18px] font-semibold leading-[26px] text-[#1AA3FF] shadow-[inset_0_0_0_1px_#CFEAFF] active:bg-[#F7FBFF]"
              >
                {secondaryLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
