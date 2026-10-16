CREATE TABLE IF NOT EXISTS famac.products (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL DEFAULT 'shared' CHECK (owner_id = 'shared'),
  name_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON famac.products FROM PUBLIC;
