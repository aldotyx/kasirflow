-- Keep catalog ownership controls in the database, not only in the UI.
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0;
DROP POLICY IF EXISTS "insert_own_products" ON products;
CREATE POLICY "insert_own_products" ON products
FOR INSERT TO authenticated
WITH CHECK (
  store_id = get_current_store_id()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'OWNER'
  )
);

DROP POLICY IF EXISTS "delete_own_products" ON products;
CREATE POLICY "delete_own_products" ON products
FOR DELETE TO authenticated
USING (
  store_id = get_current_store_id()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'OWNER'
  )
);

CREATE OR REPLACE FUNCTION protect_product_details_from_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role <> 'OWNER'
  ) AND (
    NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.sku IS DISTINCT FROM OLD.sku
    OR NEW.name IS DISTINCT FROM OLD.name
    OR NEW.image_url IS DISTINCT FROM OLD.image_url
    OR NEW.buy_price IS DISTINCT FROM OLD.buy_price
    OR NEW.sell_price IS DISTINCT FROM OLD.sell_price
    OR NEW.min_stock IS DISTINCT FROM OLD.min_stock
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  ) THEN
    RAISE EXCEPTION 'Only the store owner can change product details';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_product_details_from_staff_trigger ON products;
CREATE TRIGGER protect_product_details_from_staff_trigger
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION protect_product_details_from_staff();
