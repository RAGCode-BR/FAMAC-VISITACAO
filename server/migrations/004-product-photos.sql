CREATE TABLE IF NOT EXISTS famac.product_photos (
  id uuid PRIMARY KEY,
  -- Os produtos iniciais existem no domínio, antes de sua primeira edição.
  product_id uuid NOT NULL,
  uploaded_by text NOT NULL,
  object_key text UNIQUE NOT NULL,
  name text NOT NULL,
  bytes integer NOT NULL CHECK (bytes > 0),
  linked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_photos_product ON famac.product_photos(product_id);
REVOKE ALL ON famac.product_photos FROM PUBLIC;
