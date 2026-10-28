/** Public rendering contract: server keeps the NASA key private. */
export type HotspotPoint = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: string;
    acquiredAtUtc: string;
    confidence: string;
    frpMw: number | null;
    brightnessTi4K?: number | null;
    brightnessTi5K?: number | null;
    satellite: string;
    instrument: string;
  };
};
export type HotspotsPayload = {
  regionId:
    | "indonesia"
    | "sumatra"
    | "jawa"
    | "kalimantan"
    | "sulawesi"
    | "bali"
    | "bali_nusatenggara"
    | "maluku"
    | "papua";
  regionLabel: string;
  bbox: [number, number, number, number];
  days: 1 | 2 | 5;
  source: "NASA FIRMS";
  sensor: string;
  retrievedAtUtc: string;
  count: number;
  truncated: boolean;
  invalidRows: number;
  features: HotspotPoint[];
  limitations: string[];
};
