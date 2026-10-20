ALTER TABLE famac.members DROP CONSTRAINT IF EXISTS members_team_id_check;
ALTER TABLE famac.members ADD CONSTRAINT members_team_id_check
  CHECK (team_id IN ('claudionor','charles','celso','recepcao'));

CREATE SEQUENCE IF NOT EXISTS famac.visit_service_number_seq;
ALTER TABLE famac.visits ADD COLUMN IF NOT EXISTS service_number bigint;
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY visit_date,updated_at,id) AS number
  FROM famac.visits WHERE service_number IS NULL
)
UPDATE famac.visits AS v SET service_number=n.number FROM numbered AS n WHERE v.id=n.id;
SELECT setval('famac.visit_service_number_seq',
  GREATEST(COALESCE((SELECT max(service_number) FROM famac.visits),0),1),
  EXISTS(SELECT 1 FROM famac.visits));
ALTER TABLE famac.visits ALTER COLUMN service_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS visits_service_number_unique ON famac.visits(service_number);
UPDATE famac.visits SET payload=jsonb_set(payload,'{serviceNumber}',to_jsonb(service_number));

CREATE TABLE IF NOT EXISTS famac.crm_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  stage_labels jsonb NOT NULL
);
INSERT INTO famac.crm_settings(singleton,stage_labels) VALUES
  (true,'{"prospecting":"Em prospecção","waiting":"Aguardando retorno","negotiating":"Em negociação","won":"Venda realizada","lost":"Sem negócio"}'::jsonb)
ON CONFLICT DO NOTHING;
REVOKE ALL ON famac.crm_settings FROM PUBLIC;
REVOKE ALL ON SEQUENCE famac.visit_service_number_seq FROM PUBLIC;
