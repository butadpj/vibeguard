export interface RailStep {
  label: string;
  status: string;
  done: boolean;
  disabled: boolean;
  disabledReason?: string;
}

/** The five stages as a vertical rail (a scrolling row on narrow screens). */
export function StepRail({
  steps,
  current,
  onSelect,
}: {
  steps: RailStep[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav className="rail" aria-label="Steps">
      <ol>
        {steps.map((step, index) => (
          <li key={step.label}>
            <button
              type="button"
              className="rail-step"
              aria-current={index === current ? 'step' : undefined}
              disabled={step.disabled}
              title={step.disabled ? step.disabledReason : undefined}
              onClick={() => onSelect(index)}
            >
              <span className="rail-number" data-done={step.done}>
                {step.done ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                ) : (
                  `0${index + 1}`
                )}
              </span>
              <span className="rail-text">
                <span className="rail-label">{step.label}</span>
                <span className="rail-status">{step.status}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
