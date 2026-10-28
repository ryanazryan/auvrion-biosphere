import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import {
  createNeutralPoiIcon,
  installOpenFreeMapPoiFallback,
  isOpenFreeMapLiberty,
} from "./openfreemap-missing-icons";

describe("OpenFreeMap missing-POI icon fallback", () => {
  it("accepts only the known Liberty style endpoint", () => {
    expect(
      isOpenFreeMapLiberty("https://tiles.openfreemap.org/styles/liberty"),
    ).toBe(true);
    expect(
      isOpenFreeMapLiberty("https://tiles.openfreemap.org/styles/liberty/"),
    ).toBe(true);
    expect(
      isOpenFreeMapLiberty("https://tiles.openfreemap.org/styles/dark"),
    ).toBe(false);
    expect(isOpenFreeMapLiberty("https://evil.test/styles/liberty")).toBe(
      false,
    );
    expect(isOpenFreeMapLiberty(undefined)).toBe(false);
  });

  it("draws a nonempty visible POI dot", () => {
    const icon = createNeutralPoiIcon();
    expect(icon.data).toHaveLength(icon.width * icon.height * 4);
    const alpha = Array.from(icon.data).filter((_, i) => i % 4 === 3);
    expect(alpha.some((a) => a > 0)).toBe(true);
    expect(alpha.some((a) => a === 0)).toBe(true);
  });

  it("registers absent valid icons once without overriding built-ins", () => {
    const icons = new Set<string>(["existing"]);
    let resolver: ((id: string) => void) | undefined;
    const addImage = vi.fn((id: string) => icons.add(id));
    const map = {
      setMissingStyleImageResolver(cb: (id: string) => void) {
        resolver = cb;
      },
      hasImage(id: string) {
        return icons.has(id);
      },
      addImage,
    } as unknown as MapLibreMap;
    installOpenFreeMapPoiFallback(map);
    expect(resolver).toBeDefined();
    resolver?.("office");
    resolver?.("office");
    resolver?.("existing");
    resolver?.("../invalid");
    expect(addImage).toHaveBeenCalledTimes(1);
    expect(addImage.mock.calls[0]?.[0]).toBe("office");
  });
});
