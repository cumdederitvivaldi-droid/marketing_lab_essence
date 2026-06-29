// 라벨/값 row 리스트를 보여주는 글로벌 카드.
// 결과 화면의 '입력해 주신 정보' 등에서 사용.

export interface SummaryRow {
  label: string;
  value: string;
}

interface Props {
  title?: string;
  rows: SummaryRow[];
}

export default function SummaryCard({ title, rows }: Props) {
  if (rows.length === 0) return null;

  return (
    <div>
      {title && (
        <p className="mb-2 text-[13px] font-semibold text-text-tertiary">{title}</p>
      )}
      <div className="rounded-ds-md border border-border-subtle bg-white">
        {rows.map((row, i) => (
          <div
            key={`${row.label}-${i}`}
            className={`flex items-start gap-3 px-4 py-3 ${
              i < rows.length - 1 ? 'border-b border-surface-dim' : ''
            }`}
          >
            <p className="w-[72px] shrink-0 text-[13px] text-text-secondary">{row.label}</p>
            <p className="flex-1 text-[13px] leading-relaxed text-text-default">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
