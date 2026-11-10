interface ProgressBarProps {
  /** 0..1, or null for an indeterminate bar. */
  value: number | null;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const indeterminate = value === null;
  const clamped = indeterminate ? 0 : Math.min(1, Math.max(0, value));
  return (
    <div
      class={`mp-progress${indeterminate ? ' mp-progress--indeterminate' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped * 100)}
    >
      <div class="mp-progress__fill" style={indeterminate ? undefined : { transform: `scaleX(${clamped})` }} />
    </div>
  );
}
