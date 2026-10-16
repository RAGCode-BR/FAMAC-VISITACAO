CREATE SCHEMA IF NOT EXISTS famac;
CREATE TABLE IF NOT EXISTS famac.members (
  auth_id text PRIMARY KEY,
  name text NOT NULL,
  pin text UNIQUE NOT NULL CHECK (pin ~ '^[0-9]{6}$'),
  team_id text UNIQUE CHECK (team_id IN ('claudionor','charles','celso')),
  role text NOT NULL CHECK (role IN ('admin','collaborator')),
  active boolean NOT NULL DEFAULT true,
  CHECK (role = 'admin' OR team_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS famac.revision (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  value bigint NOT NULL DEFAULT 0
);
INSERT INTO famac.revision(singleton) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS famac.contacts (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS famac.works (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS famac.visits (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  work_id uuid NOT NULL REFERENCES famac.works(id),
  visit_date date NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS famac.plans (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  work_id uuid NOT NULL REFERENCES famac.works(id),
  visit_date date NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_owner ON famac.contacts(owner_id);
CREATE INDEX IF NOT EXISTS works_owner ON famac.works(owner_id);
CREATE INDEX IF NOT EXISTS visits_owner_date ON famac.visits(owner_id,visit_date);
CREATE INDEX IF NOT EXISTS plans_owner_date ON famac.plans(owner_id,visit_date);
CREATE INDEX IF NOT EXISTS visits_neighborhood ON famac.visits ((payload->>'neighborhood'));
CREATE TABLE IF NOT EXISTS famac.photos (
  id uuid PRIMARY KEY,
  visit_id uuid NOT NULL,
  owner_id text NOT NULL,
  object_key text UNIQUE NOT NULL,
  name text NOT NULL,
  bytes integer NOT NULL CHECK (bytes > 0),
  linked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photos_visit ON famac.photos(visit_id);
CREATE TABLE IF NOT EXISTS famac.operations (
  id uuid PRIMARY KEY,
  auth_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- A aplicação acessa somente a Function autenticada. Nenhuma tabela FAMAC é
-- exposta a clientes PostgREST ou a papéis anônimos.
REVOKE ALL ON SCHEMA famac FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA famac FROM PUBLIC;
