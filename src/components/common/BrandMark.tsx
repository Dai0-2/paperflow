interface BrandMarkProps {
  size?: number;
}

export function BrandMark({ size = 22 }: BrandMarkProps) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="28" height="28" rx="7" fill="currentColor" />
    <path d="M10.5 23V9.5H17c3.35 0 5.5 1.85 5.5 4.65 0 2.85-2.15 4.7-5.5 4.7h-3.1" stroke="var(--mark-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.9 13.25h3.25c1.25 0 2 .56 2 1.55 0 1.02-.75 1.6-2 1.6H13.9" stroke="var(--mark-ink)" strokeWidth="1.7" strokeLinecap="round" />
  </svg>;
}
