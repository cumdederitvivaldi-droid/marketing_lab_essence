// 결과·진단 화면에서 반복 노출되는 안내/경고/팁 박스의 글로벌 컴포넌트.
// 디자인 변경 시 이 파일만 수정하면 모든 사용처에 일괄 반영된다.

export type NoticeVariant = 'warn' | 'info' | 'tip';

interface Props {
  variant: NoticeVariant;
  message: string;
}

function WarnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mt-[1px] shrink-0 text-status-caution">
      <path d="M9 1L17 16H1L9 1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 7V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9" cy="13" r="0.8" fill="currentColor" />
    </svg>
  );
}

const STYLES: Record<
  NoticeVariant,
  {
    container: string;
    text: string;
    icon: 'warn' | 'none';
  }
> = {
  warn: {
    container: 'border border-status-caution-tint bg-status-caution-tint rounded-ds-sm px-4 py-3',
    text: 'text-status-caution',
    icon: 'warn',
  },
  info: {
    // brand-on-light 대비 향상: 배경 #E5F4FF + 텍스트 #004880 (WCAG AA)
    container: 'bg-primary-tint rounded-[10px] px-4 py-3',
    text: 'text-primary-strong',
    icon: 'none',
  },
  tip: {
    container: 'bg-surface-dim rounded-[10px] px-4 py-3',
    text: 'text-text-neutral',
    icon: 'none',
  },
};

export default function NoticeCard({ variant, message }: Props) {
  const s = STYLES[variant];
  return (
    <div className={`${s.container} flex items-start gap-2`}>
      {s.icon === 'warn' && <WarnIcon />}
      <p className={`text-[13px] leading-relaxed ${s.text}`}>{message}</p>
    </div>
  );
}
