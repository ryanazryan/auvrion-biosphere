"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Source } from "./observations";
import {
  type IndonesianTimeZone,
  isIndonesianZone,
  zoneFromBrowser,
} from "./time";

export type OperatorIdentity = {
  name: string;
  initials: string;
  email: string;
  organizationId: string;
  orgName: string;
};
export type OperatorValue = {
  operator: OperatorIdentity;
  sources: Source[];
  timeZone: IndonesianTimeZone;
  setTimeZone: (zone: IndonesianTimeZone) => void;
};
const OperatorContext = createContext<OperatorValue | null>(null);

export function OperatorProvider({
  value,
  children,
}: {
  value: Pick<OperatorValue, "operator" | "sources">;
  children: ReactNode;
}) {
  // SSR and initial client render deliberately start with the same fixed zone.
  const [timeZone, setZone] = useState<IndonesianTimeZone>("WIB");
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("auvrion.operator.timeZone");
    } catch {
      /* Storage may be blocked. */
    }
    const detected = zoneFromBrowser(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    setZone(isIndonesianZone(saved) ? saved : (detected ?? "WIB"));
  }, []);
  function setTimeZone(zone: IndonesianTimeZone) {
    setZone(zone);
    try {
      window.localStorage.setItem("auvrion.operator.timeZone", zone);
    } catch {
      /* In-memory selection still works. */
    }
  }
  return (
    <OperatorContext.Provider value={{ ...value, timeZone, setTimeZone }}>
      {children}
    </OperatorContext.Provider>
  );
}
export function useOperator() {
  const value = useContext(OperatorContext);
  if (!value) throw new Error("OperatorProvider tidak ditemukan");
  return value;
}
