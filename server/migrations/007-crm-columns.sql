ALTER TABLE famac.crm_settings
  ADD COLUMN IF NOT EXISTS stage_order jsonb NOT NULL
  DEFAULT '["prospecting","waiting","negotiating","won","lost"]'::jsonb;

ALTER TABLE famac.crm_settings
  ADD CONSTRAINT crm_settings_stage_order_array
  CHECK (jsonb_typeof(stage_order) = 'array');
