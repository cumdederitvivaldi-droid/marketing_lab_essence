interface Props {
  tag?: string;
  title: string;
  desc?: string;
  center?: boolean;
}

export function SectionHeader({ tag, title, desc, center }: Props) {
  return (
    <div className={`mb-16 ${center ? "text-center" : ""}`}>
      {tag && (
        <span className="inline-flex items-center h-7 px-3 rounded-full bg-primary-tint text-primary text-[13px] font-semibold mb-4">
          {tag}
        </span>
      )}
      <h2 className="text-[40px] font-extrabold tracking-[-1.5px] mb-3.5 leading-[1.15] max-lg:text-[32px] max-md:text-[28px]">
        {title}
      </h2>
      {desc && (
        <p className="text-[17px] text-text-sub leading-relaxed">{desc}</p>
      )}
    </div>
  );
}
