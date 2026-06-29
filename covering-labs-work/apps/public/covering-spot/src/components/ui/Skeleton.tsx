export function Skeleton({
  className = "",
  width,
  height,
}: {
  className?: string;
  width?: string;
  height?: string;
}) {
  return (
    <div
      className={`animate-pulse bg-bg-warm3 rounded ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonText({
  lines = 3,
  widths,
}: {
  lines?: number;
  widths?: string[];
}) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse bg-bg-warm3 rounded h-4"
          style={{ width: widths?.[i] ?? "100%" }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-bg rounded-lg border border-border-light p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-14 bg-bg-warm3 rounded-full" />
          <div className="h-4 w-16 bg-bg-warm3 rounded" />
        </div>
        <div className="h-4 w-20 bg-bg-warm3 rounded" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="h-4 w-32 bg-bg-warm3 rounded" />
          <div className="h-3 w-48 bg-bg-warm3 rounded" />
        </div>
        <div className="h-5 w-16 bg-bg-warm3 rounded shrink-0" />
      </div>
    </div>
  );
}
