import { LoaderCircle } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "quiet";
type Size = "sm" | "md" | "lg";

const base = "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-150 disabled:opacity-60 no-underline";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover hover:text-on-primary",
  secondary: "border border-line bg-bg text-primary hover:bg-primary-tint",
  ghost: "bg-transparent text-primary hover:bg-primary-tint",
  quiet: "border border-line bg-bg text-fg-2 hover:bg-surface-2 hover:text-fg",
};
const sizes: Record<Size, string> = { sm: "h-9 px-4 text-[13px]", md: "h-11 px-5 text-sm", lg: "h-13 px-7 text-[15px]" };

export const buttonClass = (variant: Variant = "primary", size: Size = "md", extra?: string) => cx(base, variants[variant], sizes[size], extra);

export function Button({ variant, size, loading, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)}>
      {loading && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return <a {...rest} className={buttonClass(variant, size, className)} />;
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("rounded-xl border border-line p-4", className)} />;
}

export function Pill({ tone = "neutral", className, children }: { tone?: "neutral" | "primary" | "current" | "moved" | "disputed" | "white"; className?: string; children: ReactNode }) {
  const tones = {
    neutral: "bg-surface text-muted",
    primary: "bg-primary-soft text-primary",
    current: "bg-current-soft text-current",
    moved: "bg-moved-soft text-moved",
    disputed: "bg-disputed-soft text-disputed",
    white: "bg-bg text-primary",
  };
  return <span className={cx("inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", tones[tone], className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("block rounded-md bg-skeleton", className)} />;
}

export function SrOnly({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx("m-0 text-[13px] font-semibold text-fg", className)}>{children}</h2>;
}
