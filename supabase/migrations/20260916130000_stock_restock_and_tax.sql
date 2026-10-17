ALTER TABLE stores
  ALTER COLUMN tax_rate SET DEFAULT 12;

UPDATE stores SET tax_rate = 12 WHERE tax_rate IS NULL;
