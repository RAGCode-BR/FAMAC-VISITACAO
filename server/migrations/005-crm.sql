CREATE TABLE IF NOT EXISTS famac.crm_opportunities (
  id uuid PRIMARY KEY,
  work_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS famac.crm_activities (
  id uuid PRIMARY KEY,
  opportunity_id uuid NOT NULL REFERENCES famac.crm_opportunities(id),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_activities_opportunity ON famac.crm_activities(opportunity_id,created_at);
CREATE TABLE IF NOT EXISTS famac.crm_sales (
  id uuid PRIMARY KEY,
  opportunity_id uuid NOT NULL REFERENCES famac.crm_opportunities(id),
  source_visit_id uuid UNIQUE REFERENCES famac.visits(id),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS famac.crm_visit_links (
  visit_id uuid PRIMARY KEY REFERENCES famac.visits(id),
  opportunity_id uuid NOT NULL REFERENCES famac.crm_opportunities(id),
  payload jsonb NOT NULL
);
REVOKE ALL ON famac.crm_opportunities,famac.crm_activities,famac.crm_sales,famac.crm_visit_links FROM PUBLIC;
