-- Altera somente o identificador exibido; auth_id, senhas e registros permanecem.
ALTER TABLE famac.members DROP CONSTRAINT members_pin_check;

UPDATE famac.members
SET pin = CASE pin
  WHEN '900001' THEN '0'
  WHEN '100001' THEN '1'
  WHEN '100002' THEN '2'
  WHEN '100003' THEN '3'
END
WHERE pin IN ('900001', '100001', '100002', '100003');

ALTER TABLE famac.members
  ADD CONSTRAINT members_pin_check CHECK (pin ~ '^[0-9]$');
