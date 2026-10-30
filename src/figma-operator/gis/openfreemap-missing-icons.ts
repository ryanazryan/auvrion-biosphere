/**
 * Fallback for missing POI symbols in OpenFreeMap Liberty's published sprite.
 * It is deliberately a neutral location dot, not a fake business-category pictogram.
 * No basemap attribution, style, vector tile, or Auvrion observation is changed.
 */
import type { Map as MapLibreMap } from "maplibre-gl";

const FALLBACK_LIMIT = 128;
const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const IMAGE_SIZE = 28;

/** Only install the resolver on the known, affected OpenFreeMap Liberty basemap. */
export function isOpenFreeMapLiberty(styleUrl: string | undefined): boolean {
  if (!styleUrl) return false;
  try {
    const url = new URL(styleUrl);
    return (
      url.origin === "https://tiles.openfreemap.org" &&
      /^\/styles\/liberty\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/** Opaque, visible neutral marker with antialiased edge; never a transparent warning mask. */
export function createNeutralPoiIcon() {
  const width = IMAGE_SIZE;
  const height = IMAGE_SIZE;
  const data = new Uint8Array(width * height * 4);
  const centerX = width / 2;
  const centerY = width / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // White marker with dark green outline + green center dot.
      const d = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      if (d >= 12.25) continue;
      const offset = (y * width + x) * 4;
      const ring = d >= 9.25;
      const core = d <= 3.5;
      data[offset] = ring ? 60 : core ? 36 : 255;
      data[offset + 1] = ring ? 80 : core ? 112 : 255;
      data[offset + 2] = ring ? 70 : core ? 82 : 255;
      data[offset + 3] = Math.max(
        0,
        Math.min(255, Math.round((12.25 - d) * 255)),
      );
    }
  }
  return { width, height, data };
}

/** Register before map load; v6 awaits this resolver before logging missing-image warnings. */
export function installOpenFreeMapPoiFallback(map: MapLibreMap): void {
  let installed = 0;
  map.setMissingStyleImageResolver((id: string) => {
    if (!ID.test(id) || map.hasImage(id) || installed >= FALLBACK_LIMIT) return;
    map.addImage(id, createNeutralPoiIcon(), { pixelRatio: 2 });
    installed += 1;
  });
}
