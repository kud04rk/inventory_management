-- Key/value application settings
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

INSERT OR IGNORE INTO settings(key, value) VALUES
    ('currency', '$'),
    ('store_name', 'My Store');
