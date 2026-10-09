import type { CheckResult, Evidence } from '@vibeguard/contracts';

export function checkExplanation(check: CheckResult) {
  if (
    check.verdict === 'failed' &&
    (check.scope === 'update' || check.scope === 'goal') &&
    check.explanation.startsWith('Edit acknowledged "') &&
    check.explanation.includes('; refreshing PostgreSQL returned "')
  )
    return 'The app reported the edit as saved, but the saved customer details did not match after refresh.';
  return check.explanation.split('\n+ actual - expected')[0];
}

export function CheckEvidence({ item }: { item: Evidence }) {
  const duration = item.durationMs?.toLocaleString();
  const summaryIsDuration =
    item.durationMs !== null &&
    [`${item.durationMs} ms`, `${duration} ms`].includes(item.summary.trim());
  return (
    <>
      <span className="check-evidence-text">{item.summary}</span>
      {item.durationMs !== null && !summaryIsDuration && (
        <span className="note"> · {duration} ms</span>
      )}
    </>
  );
}
