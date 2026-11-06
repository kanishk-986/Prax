// Prax mark, "Corners": a white corner (you) and a red corner (the person you reach) framing one space.
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5.5" fill="var(--ink)" />
      <path d="M4.5 4.5H15V7.5H7.5V15H4.5Z" fill="var(--canvas)" />
      <path d="M19.5 19.5H9V16.5H16.5V9H19.5Z" fill="var(--accent)" />
    </svg>
  );
}
