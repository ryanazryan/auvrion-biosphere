/** Map navigation is a display command, not an observation or saved device position. */
export type MapNavigationTarget = {
  longitude: number;
  latitude: number;
  label: string;
  kind: "search" | "device";
  request: number;
};

/** Only include device data returned from an explicitly authorized, org-scoped backend. */
export type ApprovedIotMapPoint = {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
  observedAtUtc: string;
  /** An actual recorded location and explicit disclosure approval are BOTH required. */
  verifiedLocation: true;
  disclosureApproved: true;
};

export function isValidIndonesiaCoordinate(
  latitude: number,
  longitude: number,
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -12 &&
    latitude <= 8 &&
    longitude >= 94 &&
    longitude <= 142
  );
}
