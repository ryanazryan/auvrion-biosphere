"use client";

import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import * as I from "./icons";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

/* ---------- Brand ---------- */
export function Wordmark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 whitespace-nowrap min-[360px]:gap-2.5",
        inverted ? "text-white" : "text-ink",
      )}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="shrink-0"
      >
        <title>Auvrion Biosphere</title>
        <circle
          cx="12"
          cy="12"
          r="10.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M12 4.5c-3.5 3-4.8 6.6-3.6 10.5M12 4.5c3.5 3 4.8 6.6 3.6 10.5M12 4.5v15"
          fill="none"
          stroke={inverted ? "#8fc9b2" : "#20785F"}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[14px] font-semibold tracking-[-0.01em] min-[360px]:text-[15px]">
        Auvrion <span className="font-normal opacity-70">Biosphere</span>
      </span>
    </span>
  );
}

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  full?: boolean;
};
export function Button({
  variant = "primary",
  loading,
  full,
  className,
  children,
  disabled,
  ...rest
}: BtnProps) {
  const v = {
    primary: "bg-brand text-white hover:bg-brand-hover",
    secondary: "bg-surface text-fg border border-line-strong hover:bg-bg",
    ghost: "text-brand hover:bg-brand-50",
    danger:
      "bg-surface text-danger border border-line-strong hover:bg-danger-50 hover:border-danger/40",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55",
        v,
        full && "w-full",
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={cx("size-4 animate-spin", className)}
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <title>Sedang memuat</title>
    <circle
      cx="12"
      cy="12"
      r="9"
      fill="none"
      stroke="currentColor"
      strokeOpacity=".25"
      strokeWidth="2.5"
    />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

/* ---------- Field validation messages ---------- */
export const FieldError = ({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) => (
  <p id={id} className="mt-1.5 flex items-start gap-1.5 text-xs text-danger">
    <I.Alert className="mt-px size-3.5 shrink-0" />
    {children}
  </p>
);

/* ---------- Feedback ---------- */
type Tone = "info" | "warn" | "danger" | "success";
const toneCls: Record<Tone, string> = {
  info: "bg-bg border-line text-fg [&_svg]:text-muted",
  warn: "bg-warn-50 border-warn/25 text-fg [&_svg]:text-warn",
  danger: "bg-danger-50 border-danger/25 text-fg [&_svg]:text-danger",
  success: "bg-brand-50 border-brand/25 text-fg [&_svg]:text-brand",
};
const toneIcon: Record<Tone, ReactNode> = {
  info: <I.Info />,
  warn: <I.Alert />,
  danger: <I.Alert />,
  success: <I.Check />,
};
export const Alert = forwardRef<
  HTMLDivElement,
  { tone?: Tone; title?: string; children?: ReactNode; live?: boolean }
>(function Alert({ tone = "info", title, children, live = true }, ref) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
      className={cx(
        "flex gap-2.5 rounded-md border px-3 py-2.5 focus:outline-none text-[13px] leading-5",
        toneCls[tone],
      )}
    >
      <span className="mt-0.5 shrink-0">{toneIcon[tone]}</span>
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && (
          <div className={title ? "text-muted" : ""}>{children}</div>
        )}
      </div>
    </div>
  );
});

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-muted hover:text-fg"
    >
      <I.ArrowLeft className="size-3.5" />
      {children}
    </a>
  );
}

export { cx };

/** Anchor styled as a button, for navigation actions. */
export const linkBtn = (variant: "primary" | "secondary" = "primary") =>
  cx(
    "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-150",
    variant === "primary"
      ? "bg-brand text-white hover:bg-brand-hover"
      : "border border-line-strong bg-surface text-fg hover:bg-bg",
  );
