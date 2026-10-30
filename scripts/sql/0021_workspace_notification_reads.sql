-- Application notifications, additive. No demo data, no destructive statements.
-- Apply after backup. Validate against the production migration journal before production deploy.
CREATE TABLE IF NOT EXISTS workspace_notification_reads (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  event_key text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id, event_key),
  CONSTRAINT workspace_notification_reads_key_ck CHECK (length(event_key) BETWEEN 4 AND 130)
);
CREATE INDEX IF NOT EXISTS workspace_notification_reads_org_user_idx
  ON workspace_notification_reads (organization_id, user_id, read_at DESC);
