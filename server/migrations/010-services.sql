CREATE TABLE famac.service_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  payload jsonb NOT NULL DEFAULT '{"services":[],"installers":[],"serviceDecisions":{},"nextInstallationNumber":1}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO famac.service_state(singleton) VALUES (true);
CREATE TABLE famac.service_history (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE famac.service_history_imports (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);
CREATE TABLE famac.service_photos (
  id uuid PRIMARY KEY,
  service_id uuid,
  uploaded_by text NOT NULL REFERENCES famac.members(auth_id),
  object_key text NOT NULL UNIQUE,
  name text NOT NULL,
  bytes integer NOT NULL CHECK (bytes > 0 AND bytes <= 5242880),
  linked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON famac.service_state, famac.service_history, famac.service_history_imports, famac.service_photos FROM PUBLIC;
