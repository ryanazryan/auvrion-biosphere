"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type Option = {
  value: string;
  label: string;
  description?: string;
};

type OperatorSelectProps = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
};

function ChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
    >
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
    >
      <path
        d="M4.5 10.5L8 14L15.5 6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OperatorSelect({
  value,
  options,
  onChange,
  placeholder = "Pilih...",
  ariaLabel,
  className = "",
  disabled = false,
}: OperatorSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listId = useId();

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        className={[
          "flex h-14 w-full items-center justify-between rounded-2xl border px-5 text-left transition",
          "border-line bg-white text-fg shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
          "hover:border-[#8fb7a8] hover:bg-[#f8fbf9]",
          "focus:outline-none focus:ring-2 focus:ring-[#8fb7a8]/35",
          "disabled:cursor-not-allowed disabled:opacity-60",
        ].join(" ")}
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">
            {selected?.label ?? placeholder}
          </span>
          {selected?.description ? (
            <span className="mt-0.5 block truncate text-sm text-muted-fg">
              {selected.description}
            </span>
          ) : null}
        </span>

        <ChevronDown
          className={`ml-3 h-5 w-5 shrink-0 text-muted-fg transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_16px_40px_rgba(16,24,40,0.12)]">
          <div
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-72 overflow-y-auto p-2"
          >
            {options.map((option) => {
              const active = option.value === value;

              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    className={[
                      "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition",
                      active
                        ? "bg-[#e8f4ee] text-[#147a55]"
                        : "text-fg hover:bg-[#f6faf8]",
                    ].join(" ")}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="mt-0.5 block truncate text-sm text-muted-fg">
                          {option.description}
                        </span>
                      ) : null}
                    </span>

                    {active ? (
                      <CheckIcon className="ml-3 h-5 w-5 shrink-0 text-[#147a55]" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
