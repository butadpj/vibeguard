import { useEffect, useRef } from 'react';

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
  const active = useRef<HTMLButtonElement>(null);
  // On narrow screens the rail scrolls sideways; keep the current step visible.
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  return (
    <nav className="rail" aria-label="Steps">
      <ol>
        {steps.map((step, index) => (
          <li key={step.label}>
            <button
              ref={index === current ? active : undefined}
              type="button"
              className="rail-step"
              aria-current={index === current ? 'step' : undefined}
              aria-label={`Step ${index + 1}: ${step.label}. ${
                step.disabled && step.disabledReason
                  ? step.disabledReason
                  : step.status
              }`}
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
                  index + 1
                )}
              </span>
              <span className="rail-text" aria-hidden="true">
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
