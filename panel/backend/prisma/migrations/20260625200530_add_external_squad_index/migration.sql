--
CREATE INDEX CONCURRENTLY users_external_squad_uuid_idx
  ON users (external_squad_uuid)
  WHERE external_squad_uuid IS NOT NULL;
