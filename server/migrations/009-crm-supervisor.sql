ALTER TABLE famac.members DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE famac.members ADD CONSTRAINT members_role_check
  CHECK (role IN ('admin','collaborator','supervisor'));

ALTER TABLE famac.members DROP CONSTRAINT IF EXISTS members_team_id_check;
ALTER TABLE famac.members ADD CONSTRAINT members_team_id_check
  CHECK (team_id IN ('claudionor','charles','celso','recepcao','joao','tulio'));
