import { BRAND } from "../config/brand";

/** Thread line through three dots: past → your article → now, the last dot filled (DESIGN.md §9). */
export function LogoMark({ size = 28, mono = false }: { size?: number; mono?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 23 C 12 22, 18 12, 28 9" fill="none" stroke={mono ? "currentColor" : "var(--tn-g-blue)"} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="6" cy="22.6" r="3.4" fill={mono ? "currentColor" : "var(--tn-g-red)"} />
      <circle cx="16" cy="16.2" r="3.4" fill={mono ? "currentColor" : "var(--tn-g-yellow)"} />
      <circle cx="26.5" cy="9.6" r="4" fill={mono ? "currentColor" : "var(--tn-g-green)"} />
    </svg>
  );
}

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-2 text-fg">
      <LogoMark size={size === "lg" ? 30 : 28} />
      <span className={size === "lg" ? "text-lg font-bold tracking-[-0.3px]" : "text-base font-bold tracking-[-0.2px]"}>{BRAND.name}</span>
    </span>
  );
}
