"use client";

import { useRef } from "react";

type Device = { id: string; label: string };

/** Native details/summary gives keyboard and outside-the-input interaction without a legacy select. */
export function MicrophonePicker({
  devices,
  selected,
  disabled,
  onSelect,
}: {
  devices: Device[];
  selected: string;
  disabled: boolean;
  onSelect: (deviceId: string) => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  // Browser enumerates "default" and "communications" aliases as separate devices.
  // They are not independent microphones; list the physical/virtual devices once.
  const available = devices.filter(
    (device) =>
      Boolean(device.id) &&
      device.id !== "default" &&
      device.id !== "communications",
  );
  const current = available.find((device) => device.id === selected);
  const label = current?.label ?? "Default browser";

  return (
    <div className="min-w-0 space-y-1">
      <span id="bio-microphone-label" className="block text-xs text-muted">
        Pilih mikrofon
      </span>
      <details
        ref={details}
        className={`group relative min-w-0 ${disabled ? "pointer-events-none" : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Escape" && details.current?.open) {
            details.current.open = false;
            event.preventDefault();
          }
        }}
      >
        <summary
          aria-labelledby="bio-microphone-label"
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden"
        >
          <span className="min-w-0 truncate">{label}</span>
          <span
            aria-hidden="true"
            className="shrink-0 text-muted group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-lg">
          {[{ id: "default", label: "Default browser" }, ...available].map(
            (device) => (
              <button
                key={device.id}
                type="button"
                disabled={disabled}
                aria-current={selected === device.id ? "true" : undefined}
                className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm text-ink hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"
                onClick={() => {
                  onSelect(device.id);
                  if (details.current) details.current.open = false;
                }}
              >
                <span className="min-w-0 truncate">{device.label}</span>
                {selected === device.id && (
                  <span className="text-brand" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ),
          )}
        </div>
      </details>
      <p className="text-[11px] leading-4 text-muted">
        Pilih perangkat fisik, bukan mikrofon virtual yang tidak memiliki
        sinyal.
      </p>
    </div>
  );
}
