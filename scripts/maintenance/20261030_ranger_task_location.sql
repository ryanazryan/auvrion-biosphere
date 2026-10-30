-- Auvrion Ranger task location snapshots, idempotent local migration.
-- Stores only the location already approved for device disclosure at assignment time.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ranger_task_location_snapshots (
  task_id uuid PRIMARY KEY REFERENCES public.domain_tasks(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL,
  zone_id uuid NOT NULL,
  geometry_version_id uuid,
  source_device_id uuid,
  location_label text,
  latitude double precision,
  longitude double precision,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ranger_task_location_zone_org_fk
    FOREIGN KEY (zone_id, organization_id)
    REFERENCES public.operational_zones(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT ranger_task_location_geometry_fk
    FOREIGN KEY (geometry_version_id)
    REFERENCES public.zone_geometry_versions(id) ON DELETE RESTRICT,
  CONSTRAINT ranger_task_location_point_pair_ck CHECK (
    (latitude IS NULL) = (longitude IS NULL)
  ),
  CONSTRAINT ranger_task_location_point_bounds_ck CHECK (
    latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  )
);
CREATE INDEX IF NOT EXISTS ranger_task_location_org_idx
  ON public.ranger_task_location_snapshots (organization_id, zone_id);

-- Backfill tasks whose original Supervisor instruction contains the canonical zone code.
-- Do not infer an older position from a *newer* installation verification.
INSERT INTO public.ranger_task_location_snapshots (
  task_id, organization_id, zone_id, geometry_version_id,
  source_device_id, location_label, latitude, longitude, verified_at
)
SELECT t.id, t.organization_id, z.id, g.id,
       installation.device_id, installation.location_label,
       installation.latitude, installation.longitude, installation.verified_at
FROM public.domain_tasks t
JOIN public.task_assignments a
  ON a.task_id = t.id AND a.organization_id = t.organization_id
JOIN public.operational_zones z
  ON z.organization_id = t.organization_id
 AND z.code = substring(t.instructions from '^Operational zone: ([A-Za-z0-9_-]+)')
LEFT JOIN LATERAL (
  SELECT v.id
  FROM public.zone_geometry_versions v
  WHERE v.zone_id = z.id AND v.organization_id = z.organization_id
    AND v.recorded_at <= a.assigned_at
  ORDER BY v.geometry_version DESC LIMIT 1
) g ON true
LEFT JOIN LATERAL (
  SELECT ir.device_id, l.location_label, l.latitude, l.longitude, l.verified_at
  FROM public.case_observation_links col
  JOIN public.observations o ON o.id = col.observation_id
    AND o.organization_id = col.organization_id
  JOIN public.ingestion_recordings ir ON ir.observation_id = o.id
    AND ir.organization_id = o.organization_id
  JOIN public.listen_device_installations l ON l.device_id = ir.device_id
    AND l.organization_id = ir.organization_id
  WHERE col.organization_id = t.organization_id AND col.case_id = t.case_id
    AND col.unlinked_at IS NULL AND o.domain = 'biodiversity'
    AND l.disclosure_approved = true AND l.verified_at <= a.assigned_at
  ORDER BY l.verified_at DESC LIMIT 1
) installation ON true
ON CONFLICT (task_id) DO NOTHING;
COMMIT;
