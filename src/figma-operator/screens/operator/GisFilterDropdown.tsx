"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export type GisDropdownOption<T extends string> = {
  value: T;
  label: string;
  short?: string;
  hint?: string;
};

type DropdownProps<T extends string> = {
  label: string;
  value: T;
  options: GisDropdownOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  modal?: boolean;
  alignEnd?: boolean;
  className?: string;
};

/** Deliberately not a native <select>: the design uses an accessible, animated choice popover. */
export function GisFilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  modal = false,
  alignEnd = false,
  className = "",
}: DropdownProps<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = options.find((item) => item.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Keyboard-open focuses the current option; pointer users can still select any option.
  const openMenu = (keyboard = false) => {
    const index = Math.max(
      0,
      options.findIndex((item) => item.value === value),
    );
    setActive(index);
    setOpen(true);
    if (keyboard) requestAnimationFrame(() => buttons.current[index]?.focus());
  };
  const select = (index: number) => {
    const item = options[index];
    if (!item) return;
    onChange(item.value);
    setOpen(false);
    trigger.current?.focus();
  };
  const onOptionsKey = (event: ReactKeyboardEvent<HTMLFieldSetElement>) => {
    const last = options.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = Math.min(last, active + 1);
    if (event.key === "ArrowUp") next = Math.max(0, active - 1);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next !== null) {
      event.preventDefault();
      setActive(next);
      buttons.current[next]?.focus();
    }
    if (event.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className={`relative min-w-0 ${className}`}>
      {modal && (
        <span className="mb-1.5 block text-[13px] font-medium text-muted">
          {label}
        </span>
      )}
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-label={`${label}: ${chosen?.label ?? "Tidak tersedia"}`}
        aria-expanded={open}
        aria-controls={`${id}-choices`}
        title={chosen?.label}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(true);
          }
        }}
        className={`group flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-line-strong bg-white px-3 text-left text-[13px] text-fg transition-[border-color,background-color,box-shadow] duration-150 hover:border-brand/50 hover:bg-brand-50/20 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50 ${modal ? "h-11" : ""} ${open ? "border-brand/50 ring-2 ring-brand/10" : ""}`}
      >
        {!modal && <span className="shrink-0 text-muted">{label}</span>}
        <span
          className="min-w-0 flex-1 truncate font-medium text-ink"
          title={chosen?.label}
        >
          {chosen?.short ?? chosen?.label ?? "Tidak tersedia"}
        </span>
        <svg
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <fieldset
        id={`${id}-choices`}
        disabled={!open}
        aria-hidden={!open}
        onKeyDown={onOptionsKey}
        className={`${modal ? "relative mt-2 w-full transition-[max-height,opacity,transform]" : `absolute top-full z-50 mt-1.5 w-[max(100%,15rem)] max-w-[min(19rem,calc(100vw-2rem))] transition-[opacity,transform,visibility] ${alignEnd ? "right-0" : "left-0"}`} rounded-lg border border-line bg-white p-1 text-[13px] shadow-lg duration-150 ease-out motion-reduce:transition-none ${open ? `visible translate-y-0 opacity-100 ${modal ? "max-h-72 overflow-y-auto" : "max-h-80 overflow-y-auto"}` : `invisible -translate-y-1 opacity-0 ${modal ? "max-h-0 overflow-hidden !border-0 !p-0 !mt-0" : "pointer-events-none"}`}`}
      >
        <legend className="sr-only">Pilih {label.toLowerCase()}</legend>
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value || "__all__"}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              tabIndex={open ? 0 : -1}
              aria-pressed={selected}
              onClick={() => select(index)}
              onFocus={() => setActive(index)}
              className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left outline-none transition-colors duration-100 focus-visible:bg-brand-50 focus-visible:ring-1 focus-visible:ring-brand/30 ${active === index ? "bg-brand-50/50" : "hover:bg-bg/70"}`}
            >
              <svg
                aria-hidden="true"
                className={`mt-0.5 size-3.5 shrink-0 text-brand ${selected ? "" : "invisible"}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
              <span className="min-w-0 flex-1">
                <span
                  className={`block wrap-break-word ${selected ? "font-semibold text-ink" : "font-normal text-fg"}`}
                >
                  {option.label}
                </span>
                {option.hint && (
                  <span className="mt-0.5 block wrap-break-word text-xs leading-5 text-muted">
                    {option.hint}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}

/** A custom time popover instead of the operating-system date/select menu. */
export function GisReceivedTimeDropdown({
  from,
  to,
  timeZone,
  onChange,
}: {
  from: string;
  to: string;
  timeZone: "WIB" | "WITA" | "WIT";
  onChange: (change: { from?: string; to?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const hasRange = Boolean(from || to);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-time`}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-9 items-center gap-2 rounded-md border border-line-strong bg-white px-3 text-[13px] text-fg transition-[border-color,background-color] duration-150 hover:border-brand/50 hover:bg-brand-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/15 ${open ? "border-brand/50 ring-2 ring-brand/10" : ""}`}
      >
        <span className="text-muted">Diterima</span>
        <span className="font-medium text-ink">
          {hasRange ? `Rentang (${timeZone})` : "Semua waktu"}
        </span>
        <svg
          aria-hidden="true"
          className={`size-3.5 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <section
        id={`${id}-time`}
        aria-label={`Filter waktu diterima (${timeZone})`}
        aria-hidden={!open}
        className={`absolute top-full left-0 z-50 mt-1.5 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-line bg-white p-3 text-[13px] shadow-lg transition-[opacity,transform,visibility] duration-150 ease-out motion-reduce:transition-none ${open ? "visible translate-y-0 opacity-100" : "pointer-events-none invisible -translate-y-1 opacity-0"}`}
      >
        <p className="mb-3 text-xs leading-5 text-muted">
          Rentang waktu diterima · {timeZone}
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Dari
            <input
              tabIndex={open ? 0 : -1}
              type="datetime-local"
              value={from}
              onChange={(event) => onChange({ from: event.target.value })}
              className="h-10 min-w-0 rounded-md border border-line-strong bg-white px-2 text-[13px] text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Sampai
            <input
              tabIndex={open ? 0 : -1}
              type="datetime-local"
              value={to}
              onChange={(event) => onChange({ to: event.target.value })}
              className="h-10 min-w-0 rounded-md border border-line-strong bg-white px-2 text-[13px] text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => onChange({ from: "", to: "" })}
            className="text-xs text-brand hover:underline"
          >
            Semua waktu
          </button>
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
            className="rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            Selesai
          </button>
        </div>
      </section>
    </div>
  );
}
