-- Auvrion LISTEN: installation locations, NOT wildlife observation coordinates.
-- Run ONLY after reviewing the current development database schema.
CREATE TABLE IF NOT EXISTS listen_device_installations (
  device_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  location_label text NOT NULL,
  verification_method text NOT NULL,
  disclosure_approved boolean NOT NULL DEFAULT false,
  verified_by_user_id text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listen_device_installations_device_org_fk
    FOREIGN KEY (device_id, organization_id)
    REFERENCES ingestion_devices (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT listen_device_installations_actor_fk
    FOREIGN KEY (verified_by_user_id) REFERENCES "user" (id) ON DELETE RESTRICT,
  CONSTRAINT listen_device_installations_bounds_ck
    CHECK (latitude BETWEEN -12 AND 8 AND longitude BETWEEN 94 AND 142),
  CONSTRAINT listen_device_installations_method_ck
    CHECK (verification_method IN ('field_gps','manual_map_verified')),
  CONSTRAINT listen_device_installations_label_ck
    CHECK (char_length(trim(location_label)) BETWEEN 3 AND 120)
);
CREATE INDEX IF NOT EXISTS listen_device_installations_org_approved_idx
  ON listen_device_installations (organization_id, disclosure_approved);
