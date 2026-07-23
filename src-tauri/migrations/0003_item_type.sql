-- Classify items as raw materials or finished goods
ALTER TABLE items ADD COLUMN type TEXT NOT NULL DEFAULT 'finished';
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
