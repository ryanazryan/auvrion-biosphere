"use client";

import { SelectMenu } from "@/components/ui/SelectMenu";
import { ISLAND_OPTIONS, type IslandRegion } from "./island-regions";

export function IslandSelector({
  value,
  onChange,
  className = "",
}: {
  value: IslandRegion;
  onChange: (value: IslandRegion) => void;
  className?: string;
}) {
  return (
    <SelectMenu
      label="Fokus pulau"
      value={value}
      onChange={onChange}
      options={ISLAND_OPTIONS}
      className={className}
    />
  );
}
