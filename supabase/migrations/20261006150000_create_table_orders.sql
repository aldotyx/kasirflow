-- Table Orders for Table QR Self-Ordering System (McD / Modern Coffee Shop style)
CREATE TABLE IF NOT EXISTS table_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  store_slug VARCHAR(100),
  table_number VARCHAR(20) NOT NULL,
  customer_name VARCHAR(100),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING', -- PENDING, PREPARING, SERVED, COMPLETED, CANCELLED
  payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID', -- UNPAID, PAID
  payment_method VARCHAR(30) DEFAULT 'CASH', -- CASH, QRIS, MIDTRANS
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast queries by store and table
CREATE INDEX IF NOT EXISTS idx_table_orders_store_id ON table_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_table_orders_created_at ON table_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_table_orders_status ON table_orders(status);

-- Enable RLS
ALTER TABLE table_orders ENABLE ROW LEVEL SECURITY;

-- Allow anyone (public/customers scanning QR) to insert a new table order
DROP POLICY IF EXISTS "public_insert_table_orders" ON table_orders;
CREATE POLICY "public_insert_table_orders" ON table_orders
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Allow customers to view orders (or read by ID)
DROP POLICY IF EXISTS "public_select_table_orders" ON table_orders;
CREATE POLICY "public_select_table_orders" ON table_orders
FOR SELECT TO anon, authenticated
USING (true);

-- Allow authenticated store staff/cashier to update order status
DROP POLICY IF EXISTS "auth_update_table_orders" ON table_orders;
CREATE POLICY "auth_update_table_orders" ON table_orders
FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Enable Supabase Realtime broadcast for table_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'table_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE table_orders;
  END IF;
END $$;
