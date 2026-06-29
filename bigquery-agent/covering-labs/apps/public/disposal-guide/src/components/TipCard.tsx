import type { ReactNode } from 'react';

export type TipCardVariant = 'primary' | 'default';

interface Props {
  icon: ReactNode;
  subtitle: string;
  title: string;
  highlights?: string[]; // title 안에서 brand color로 강조할 부분 토큰
  variant?: TipCardVariant;
}

const STYLES: Record<TipCardVariant, { container: string; title: string; iconBg: string }> = {
  primary: {
    container: 'bg-primary-tint',
    title: 'text-primary',
    iconBg: 'bg-white',
  },
  default: {
    container: 'bg-surface-dim',
    title: 'text-text-default',
    iconBg: 'bg-white',
  },
};

function renderTitleWithHighlights(title: string, highlights?: string[]): ReactNode {
  if (!highlights || highlights.length === 0) return title;

  // 빈 문자열·공백 제거: 빈 토큰이 들어오면 정규식이 모든 위치에 매칭되어 깨짐
  const normalized = highlights.map((h) => h.trim()).filter((h) => h.length > 0);
  if (normalized.length === 0) return title;

  // 가장 긴 토큰부터 매칭하도록 정렬 (중첩 방지)
  const sorted = [...normalized].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'g');
  const parts = title.split(re);

  return parts.map((p, i) =>
    sorted.includes(p) ? (
      <span key={i} className="text-primary">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export default function TipCard({ icon, subtitle, title, highlights, variant = 'default' }: Props) {
  const s = STYLES[variant];
  return (
    <div className={`${s.container} flex items-center gap-3 rounded-ds-lg px-4 py-4`}>
      <div className={`${s.iconBg} flex h-10 w-10 shrink-0 items-center justify-center rounded-ds-md text-[20px]`}>
        {icon}
      </div>
      <div className="flex flex-1 flex-col">
        <p className="text-label1-regular font-medium text-text-secondary">{subtitle}</p>
        <p className={`mt-0.5 text-[15px] font-bold leading-[1.4] ${s.title}`}>
          {renderTitleWithHighlights(title, highlights)}
        </p>
      </div>
    </div>
  );
}
