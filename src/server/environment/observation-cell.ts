import type { BoundingBox } from "./contracts";

/** One-degree geographic cell containing a risk observation. No precise point is sent upstream. */
export function observationCell(
  latitude: number,
  longitude: number,
): BoundingBox {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new RangeError("INVALID_OBSERVATION_POINT");
  }
  const south = Math.min(89, Math.floor(latitude));
  const west = Math.min(179, Math.floor(longitude));
  return [west, south, west + 1, south + 1] as const;
}
