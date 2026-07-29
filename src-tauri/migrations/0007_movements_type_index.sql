-- Speed up dashboard queries that filter movements by type (e.g. sales / top sellers)
-- and allow a future created_at bound on the same lookup.
CREATE INDEX IF NOT EXISTS idx_movements_type_created ON movements(type, created_at);
