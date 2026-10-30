import "server-only";
import { Pool } from "pg";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { UUID } from "@/server/device-ingestion/device-admin-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let pool: Pool | undefined;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}

/** Returns only installations that an Admin has explicitly approved for Operator disclosure. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const organizationId = query.get("organizationId");
  if (
    !organizationId ||
    !UUID.test(organizationId) ||
    query.size !== 1 ||
    query.getAll("organizationId").length !== 1
  ) {
    return reply({ error: "INVALID_REQUEST" }, 400);
  }
  const access = await checkOperationalAccess(organizationId, "operator");
  if (!access.allowed) return reply({ error: access.reason }, access.status);
  try {
    if (!process.env.DATABASE_URL)
      return reply({ error: "DATABASE_NOT_CONFIGURED" }, 503);
    pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
    const result = await pool.query<{
      id: string;
      label: string;
      latitude: number;
      longitude: number;
      observed_at_utc: Date;
      source_code: string;
      zone_name: string | null;
    }>(
      `SELECT l.device_id AS id,
              l.location_label AS label,
              l.latitude,
              l.longitude,
              l.verified_at AS observed_at_utc,
              s.code AS source_code,
              (
                SELECT z.name
                  FROM operational_zones z
                  JOIN zone_geometry_versions g
                    ON g.zone_id = z.id
                   AND g.organization_id = z.organization_id
                 WHERE z.organization_id = l.organization_id
                   AND g.geometry_version = (
                     SELECT MAX(g2.geometry_version)
                       FROM zone_geometry_versions g2
                      WHERE g2.zone_id = z.id
                        AND g2.organization_id = z.organization_id
                   )
                   AND ST_Covers(
                     g.boundary,
                     ST_SetSRID(ST_MakePoint(l.longitude, l.latitude), 4326)
                   )
                 ORDER BY z.name
                 LIMIT 1
              ) AS zone_name
         FROM listen_device_installations l
         JOIN ingestion_devices d
           ON d.id = l.device_id
          AND d.organization_id = l.organization_id
         JOIN observation_sources s
           ON s.id = d.source_id
          AND s.organization_id = d.organization_id
        WHERE l.organization_id = $1
          AND l.disclosure_approved = true
          AND d.status = 'active'
        ORDER BY l.verified_at DESC
        LIMIT 200`,
      [organizationId],
    );
    return reply({
      items: result.rows.map((row) => ({
        id: row.id,
        label: row.label,
        latitude: row.latitude,
        longitude: row.longitude,
        observedAtUtc: row.observed_at_utc.toISOString(),
        sourceCode: row.source_code,
        zoneName: row.zone_name,
        verifiedLocation: true,
        disclosureApproved: true,
      })),
    });
  } catch {
    return reply({ error: "IOT_LOCATIONS_UNAVAILABLE" }, 503);
  }
}
