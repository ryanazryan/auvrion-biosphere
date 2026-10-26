"use client";

import { useEffect, useId, useRef, useState } from "react";

type Option<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

/** Keyboard-accessible, shared short-list selector. Does not replace native text/date fields. */
export function SelectMenu<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = "",
}: {
  id?: string;
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function pointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);

  return (
    <div ref={root} className={`relative min-w-0 ${className}`}>
      <button
        id={id}
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-line-strong bg-white px-3 text-left text-sm text-fg transition-colors hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"
      >
        <span className="truncate font-medium">{selected?.label ?? value}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <title>Pilihan dropdown</title>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && !disabled && (
        <fieldset
          id={listId}
          className="absolute top-full right-0 left-0 z-50 mt-1.5 min-w-48 rounded-lg border border-line bg-white p-1.5 shadow-lg"
        >
          <legend className="sr-only">{label}</legend>
          {options.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-bg ${option.value === value ? "bg-brand-50 text-brand" : "text-fg"}`}
            >
              <input
                type="radio"
                name={listId}
                value={option.value}
                checked={option.value === value}
                onChange={() => {
                  onChange(option.value);
                  setOpen(false);
                  button.current?.focus();
                }}
                className="sr-only"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{option.label}</span>
                {option.description && (
                  <span className="block text-xs text-muted">
                    {option.description}
                  </span>
                )}
              </span>
              <span
                aria-hidden="true"
                className="ml-auto grid size-4 shrink-0 place-items-center text-brand"
              >
                {option.value === value && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4"
                  >
                    <title>Opsi terpilih</title>
                    <path d="m20 6-11 11-5-5" />
                  </svg>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
