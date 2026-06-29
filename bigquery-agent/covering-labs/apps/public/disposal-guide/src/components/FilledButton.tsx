interface Props {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export default function FilledButton({ label, onClick, disabled = false }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[50px] w-full items-center justify-center rounded-ds-sm text-title3-emphasized text-white transition-opacity active:opacity-80 ${
        disabled ? 'bg-text-placeholder' : 'bg-primary'
      }`}
    >
      {label}
    </button>
  );
}
