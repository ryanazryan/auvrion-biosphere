"use client";

/** Hamburger transforms into an X when the desktop sidebar is visible. */
export function SidebarToggleIcon({ open }: { open: boolean }) {
  const base =
    "absolute left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-200 ease-out motion-reduce:transition-none";
  return (
    <span aria-hidden="true" className="relative block size-5">
      <span
        className={`${base} top-[4px] ${open ? "translate-y-[5px] rotate-45" : ""}`}
      />
      <span className={`${base} top-[9px] ${open ? "opacity-0" : ""}`} />
      <span
        className={`${base} top-[14px] ${open ? "-translate-y-[5px] -rotate-45" : ""}`}
      />
    </span>
  );
}
