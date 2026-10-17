-- ==============================================================================
-- KASIRFLOW: FIX ROW LEVEL SECURITY (RLS) POLICIES UNTUK SEMUA TRANSAKSI
-- Jalankan skrip ini di: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. IZIN UNTUK ANTREAN MEJA (table_orders)
-- Memungkinkan pembeli scan barcode QR & kasir melihat antrean secara realtime
ALTER TABLE IF EXISTS table_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_table_orders" ON table_orders;
CREATE POLICY "public_insert_table_orders" ON table_orders
FOR INSERT TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "public_select_table_orders" ON table_orders;
CREATE POLICY "public_select_table_orders" ON table_orders
FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "public_update_table_orders" ON table_orders;
CREATE POLICY "public_update_table_orders" ON table_orders
FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "public_delete_table_orders" ON table_orders;
CREATE POLICY "public_delete_table_orders" ON table_orders
FOR DELETE TO anon, authenticated
USING (true);

-- 2. IZIN UNTUK TRANSAKSI PENJUALAN KASIR (sales)
ALTER TABLE IF EXISTS sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_sales" ON sales;
CREATE POLICY "public_insert_sales" ON sales
FOR INSERT TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "public_select_sales" ON sales;
CREATE POLICY "public_select_sales" ON sales
FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "public_update_sales" ON sales;
CREATE POLICY "public_update_sales" ON sales
FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 3. IZIN UNTUK DETAIL ITEM PENJUALAN (sale_items)
ALTER TABLE IF EXISTS sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_sale_items" ON sale_items;
CREATE POLICY "public_insert_sale_items" ON sale_items
FOR INSERT TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "public_select_sale_items" ON sale_items;
CREATE POLICY "public_select_sale_items" ON sale_items
FOR SELECT TO anon, authenticated
USING (true);

-- 4. IZIN UNTUK LOG INVENTORI & PENGURANGAN STOK (inventory_logs)
ALTER TABLE IF EXISTS inventory_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_inventory_logs" ON inventory_logs;
CREATE POLICY "public_insert_inventory_logs" ON inventory_logs
FOR INSERT TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "public_select_inventory_logs" ON inventory_logs;
CREATE POLICY "public_select_inventory_logs" ON inventory_logs
FOR SELECT TO anon, authenticated
USING (true);

-- 5. DAFTARKAN REALTIME UNTUK TABLE ORDERS (SUPAYA KASIR LANGSUNG BUNYI LONCENG)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'table_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE table_orders;
  END IF;
END $$;
