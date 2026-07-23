-- Track per-batch cost and remaining quantity for FIFO inventory valuation.
ALTER TABLE movements ADD COLUMN unit_price REAL;
ALTER TABLE movements ADD COLUMN remaining INTEGER;
ALTER TABLE movements ADD COLUMN consumed TEXT;

-- Existing 'in' movements: their full quantity is treated as still on hand,
-- priced at the item's current unit price.
UPDATE movements SET remaining = quantity
  WHERE type = 'in' AND remaining IS NULL;
UPDATE movements SET unit_price = (
    SELECT price FROM items WHERE items.id = movements.item_id
  )
  WHERE type = 'in' AND unit_price IS NULL;

-- Switch the legacy default currency to Indian Rupees (custom values are left as-is).
UPDATE settings SET value = '₹' WHERE key = 'currency' AND value = '₹';
