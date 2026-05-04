export type BoolSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
} & (
  | { 'aria-label': string; 'aria-labelledby'?: undefined }
  | { 'aria-labelledby': string; 'aria-label'?: undefined }
);

export function BoolSwitch(props: BoolSwitchProps) {
  const { checked, disabled, onChange, ...a11y } = props;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`bool-switch${checked ? ' bool-switch--on' : ''}`}
      onClick={() => onChange(!checked)}
      {...a11y}
    >
      <span className="bool-switch-track" aria-hidden>
        <span className="bool-switch-thumb" />
      </span>
    </button>
  );
}

