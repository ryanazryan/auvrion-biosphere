-- LISTEN remote control v1. Additive to WC-017. Never deletes recordings.
-- Review on dev DB and back up before application; NOT part of drizzle journal.
CREATE TABLE IF NOT EXISTS listen_remote_controls (
  device_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  command_revision bigint NOT NULL DEFAULT 0,
  applied_revision bigint NOT NULL DEFAULT 0,
  desired_action text,
  interval_seconds integer NOT NULL DEFAULT 300,
  reported_monitoring boolean,
  reported_interval_seconds integer,
  last_seen_at timestamptz,
  last_ack_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listen_remote_controls_device_org_fk
    FOREIGN KEY (device_id, organization_id)
    REFERENCES ingestion_devices(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT listen_remote_controls_interval_ck
    CHECK (interval_seconds IN (60, 300, 900)),
  CONSTRAINT listen_remote_controls_reported_interval_ck
    CHECK (reported_interval_seconds IS NULL OR reported_interval_seconds IN (60, 300, 900)),
  CONSTRAINT listen_remote_controls_action_ck
    CHECK (desired_action IS NULL OR desired_action IN ('start','pause','interval')),
  CONSTRAINT listen_remote_controls_revision_ck
    CHECK (command_revision >= 0 AND applied_revision >= 0 AND applied_revision <= command_revision)
);
CREATE INDEX IF NOT EXISTS listen_remote_controls_org_idx
  ON listen_remote_controls (organization_id, last_seen_at DESC);
