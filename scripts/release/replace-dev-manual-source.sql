-- OPTIONAL, REVIEWED DEV DB CLEANUP ONLY. Preserve all historical observations and WAV files.
-- Create a real manual input source for AUVRION-LOCAL and disable the dev source.
-- Run only after reviewing audit-dev-data.sql and taking a DB backup.
BEGIN;
INSERT INTO observation_sources (organization_id, kind, code, label, is_active)
SELECT id, 'manual', 'FIELD-MANUAL', 'Pencatatan Lapangan Operator', true
FROM organizations WHERE code='AUVRION-LOCAL'
ON CONFLICT (organization_id, code)
DO UPDATE SET label=EXCLUDED.label, is_active=true;

UPDATE observation_sources AS src
SET is_active=false
FROM organizations AS o
WHERE src.organization_id=o.id AND o.code='AUVRION-LOCAL'
  AND src.kind='manual' AND src.code='WC009-MANUAL-DEV';

COMMIT;
