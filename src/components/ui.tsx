import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "gold";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-berry text-white shadow-[0_4px_0_var(--color-berry-deep)] hover:brightness-105 active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-berry-deep)]",
  secondary: "bg-pine text-white shadow-[0_4px_0_var(--color-pine-deep)] hover:brightness-110 active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-pine-deep)]",
  gold: "bg-gold text-ink shadow-[0_4px_0_#a87a22] hover:brightness-105 active:translate-y-[3px] active:shadow-[0_1px_0_#a87a22]",
  ghost: "bg-white/70 text-ink ring-1 ring-ink/10 hover:bg-white active:scale-[0.98]",
};

const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 py-3 font-semibold transition-all duration-150 select-none disabled:pointer-events-none disabled:opacity-45";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-white/85 p-5 shadow-sm ring-1 ring-ink/5 backdrop-blur ${className}`}>{children}</div>;
}

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-6 ${className}`}>{children}</main>;
}

export function BackLink({ href = "/", children = "← Back" }: { href?: string; children?: ReactNode }) {
  return (
    <Link href={href} className="mb-4 inline-block text-sm font-medium text-muted hover:text-ink">
      {children}
    </Link>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="animate-pop-in rounded-2xl bg-berry/10 px-4 py-3 text-sm font-medium text-berry-deep">
      {children}
    </p>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-muted">
      <span className="animate-wiggle text-5xl" aria-hidden>
        🎁
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-ink/15 transition-colors peer-checked:bg-pine peer-focus-visible:ring-2 peer-focus-visible:ring-gold after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}
