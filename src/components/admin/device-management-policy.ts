/** Pure, organization-scoped UI projections. Server queries enforce organization access. */
export function provisionableSources<
  T extends { id: string; isActive: boolean },
>(
  sources: readonly T[],
  registeredDevices: readonly { sourceId: string }[],
): T[] {
  const assigned = new Set(registeredDevices.map((device) => device.sourceId));
  return sources.filter(
    (source) => source.isActive && !assigned.has(source.id),
  );
}

export type DeviceStatusFilter = "all" | "active" | "revoked";
export function filterDeviceRows<
  T extends {
    id: string;
    status: "active" | "revoked";
    sourceCode: string;
    sourceLabel: string;
  },
>(devices: readonly T[], query: string, filter: DeviceStatusFilter): T[] {
  const needle = query.trim().toLowerCase();
  return devices.filter((device) => {
    if (filter !== "all" && device.status !== filter) return false;
    return `${device.id} ${device.sourceCode} ${device.sourceLabel}`
      .toLowerCase()
      .includes(needle);
  });
}
