// Prax mark: two offset bars, a pipeline moving forward.
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="var(--ink)" />
      <rect x="6.5" y="7.5" width="8" height="3" rx="1.5" fill="var(--canvas)" />
      <rect x="9.5" y="13.5" width="8" height="3" rx="1.5" fill="var(--accent)" />
    </svg>
  );
}
