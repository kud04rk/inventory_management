-- Items catalog
CREATE TABLE IF NOT EXISTS items (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    sku           TEXT,
    category      TEXT,
    quantity      INTEGER NOT NULL DEFAULT 0,
    unit          TEXT,
    price         REAL NOT NULL DEFAULT 0,
    location      TEXT,
    reorder_level INTEGER NOT NULL DEFAULT 0,
    notes         TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

-- Stock movements (in / out history)
CREATE TABLE IF NOT EXISTS movements (
    id         TEXT PRIMARY KEY,
    item_id    TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('in', 'out')),
    quantity   INTEGER NOT NULL,
    reason     TEXT,
    note       TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_movements_item ON movements(item_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON movements(created_at);
