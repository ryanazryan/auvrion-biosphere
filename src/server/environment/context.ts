import "server-only";
import {
  type BmkgData,
  type BoundingBox,
  type FirmsData,
  parseBmkg,
  parseBoundingBox,
  parseFirms,
} from "./contracts";
export type Source<T> =
  | { state: "available"; retrievedAtUtc: string; data: T }
  | { state: "unavailable"; reason: "missing_key" | "upstream_error" };
export type EnvironmentalContext = {
  region: string;
  retrievedAtUtc: string;
  bmkg: Source<BmkgData>;
  nasa: Source<FirmsData>;
  sources: { bmkg: string; nasa: string };
  limitations: string[];
};
export const SOURCE_LINKS = {
  bmkg: "https://data.bmkg.go.id/prakiraan-cuaca/",
  nasa: "https://firms.modaps.eosdis.nasa.gov/api/area",
};
export class RegionConfigError extends Error {
  constructor() {
    super("EXTERNAL_REGION_NOT_CONFIGURED");
  }
}
const CAP = 1_000_000;
async function bounded(r: Response) {
  if (!r.ok) throw Error("UPSTREAM_FAILED");
  if (Number(r.headers.get("content-length")) > CAP)
    throw Error("UPSTREAM_TOO_LARGE");
  if (!r.body) throw Error("EMPTY");
  const rd = r.body.getReader(),
    blocks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const v = await rd.read();
      if (v.done) break;
      size += v.value.byteLength;
      if (size > CAP) {
        await rd.cancel();
        throw Error("UPSTREAM_TOO_LARGE");
      }
      blocks.push(v.value);
    }
  } finally {
    rd.releaseLock();
  }
  return Buffer.concat(blocks).toString("utf8");
}
async function weather(adm4: string): Promise<Source<BmkgData>> {
  try {
    const u = new URL("https://api.bmkg.go.id/publik/prakiraan-cuaca");
    u.searchParams.set("adm4", adm4);
    const body = await bounded(
      await fetch(u, { signal: AbortSignal.timeout(8000), cache: "no-store" }),
    );
    return {
      state: "available",
      retrievedAtUtc: new Date().toISOString(),
      data: parseBmkg(JSON.parse(body) as unknown, adm4),
    };
  } catch {
    return { state: "unavailable", reason: "upstream_error" };
  }
}
async function thermal(box: BoundingBox): Promise<Source<FirmsData>> {
  const key = process.env.AUVRION_FIRMS_MAP_KEY;
  if (!key || !/^[A-Za-z0-9]{24,64}$/.test(key))
    return { state: "unavailable", reason: "missing_key" };
  try {
    // NASA URL contains a credential. NEVER log this URL or return it to the client.
    const u = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_NOAA20_NRT/${box.join(",")}/2`;
    const csv = await bounded(
      await fetch(u, { signal: AbortSignal.timeout(8000), cache: "no-store" }),
    );
    return {
      state: "available",
      retrievedAtUtc: new Date().toISOString(),
      data: parseFirms(csv, box),
    };
  } catch {
    return { state: "unavailable", reason: "upstream_error" };
  }
}
let cache: { key: string; until: number; value: EnvironmentalContext } | null =
  null;
let active: { key: string; promise: Promise<EnvironmentalContext> } | null =
  null;
export async function getEnvironmentalContext(
  orgId: string,
): Promise<EnvironmentalContext> {
  const org = process.env.AUVRION_EXTERNAL_ORGANIZATION_ID,
    adm4 = process.env.AUVRION_BMKG_ADM4,
    boxInput = process.env.AUVRION_FIRMS_BBOX,
    region = process.env.AUVRION_EXTERNAL_REGION_LABEL;
  if (
    !org ||
    org.toLowerCase() !== orgId.toLowerCase() ||
    !adm4 ||
    !/^[0-9]{2}\.[0-9]{2}\.[0-9]{2}\.[0-9]{4}$/.test(adm4) ||
    !boxInput ||
    !region ||
    region.length > 80
  )
    throw new RegionConfigError();
  let box: BoundingBox;
  try {
    box = parseBoundingBox(boxInput);
  } catch {
    throw new RegionConfigError();
  }
  const key = [
    org.toLowerCase(),
    adm4,
    box.join(","),
    region,
    process.env.AUVRION_FIRMS_MAP_KEY ? "key-present" : "no-key",
  ].join("|");
  if (cache?.key === key && cache.until > Date.now()) return cache.value;
  if (active?.key === key) return active.promise;
  const p = (async () => {
    const [bmkg, nasa] = await Promise.all([weather(adm4), thermal(box)]);
    const value: EnvironmentalContext = {
      region,
      retrievedAtUtc: new Date().toISOString(),
      bmkg,
      nasa,
      sources: SOURCE_LINKS,
      limitations: [
        "BMKG merupakan prakiraan, bukan pengukuran IoT langsung.",
        "NASA FIRMS mencatat deteksi termal satelit, bukan bukti kebakaran terkonfirmasi.",
        "Nol deteksi tidak menjamin bebas kebakaran dan data wilayah tidak berarti kondisi di satu titik observasi.",
      ],
    };
    cache = {
      key,
      value,
      until:
        Date.now() +
        (bmkg.state === "available" || nasa.state === "available"
          ? 15 * 60_000
          : 60_000),
    };
    return value;
  })();
  active = { key, promise: p };
  try {
    return await p;
  } finally {
    if (active?.promise === p) active = null;
  }
}
