interface Props {
  current: number;
}

export default function ProgressBar({ current }: Props) {
  return (
    <div className="flex gap-[6px] px-5 pt-3">
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
            n <= current ? 'bg-primary' : 'bg-border-subtle'
          }`}
        />
      ))}
    </div>
  );
}
