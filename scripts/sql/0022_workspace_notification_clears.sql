-- Operator, Supervisor, Ranger: clear notifications for one user and one role.
-- Additive: does not delete receipts, observations, Cases or read history.
-- Apply only after reviewing DB target and backing up. Reconcile with Drizzle before deployment.
CREATE TABLE IF NOT EXISTS workspace_notification_clears (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('operator', 'supervisor', 'ranger')),
  cleared_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id, role)
);
