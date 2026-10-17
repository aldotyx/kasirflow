export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER';

export type PaymentMethod = 'CASH' | 'QRIS' | 'TRANSFER' | 'DEBIT' | 'CREDIT';

export type SaleStatus = 'COMPLETED' | 'REFUNDED';

export type InventoryLogType = 'SALE' | 'RESTOCK' | 'ADJUSTMENT_OUT' | 'ADJUSTMENT' | 'REFUND';

export interface Store {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  tax_rate: number;
  logo_url?: string | null;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  store_id: string | null;
  role: UserRole;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  store_id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  category_id: string | null;
  sku: string | null;
  name: string;
  image_url: string | null;
  buy_price: number;
  sell_price: number;
  discount_percent: number;
  stock: number;
  min_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  category?: Category | null;
}

export interface InventoryLog {
  id: string;
  store_id: string;
  product_id: string;
  user_id: string;
  type: InventoryLogType;
  quantity_change: number;
  stock_before: number;
  stock_after: number;
  note: string | null;
  created_at: string;
  product?: Pick<Product, 'id' | 'name'> | null;
}

export interface Sale {
  id: string;
  store_id: string;
  user_id: string;
  invoice_number: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  grand_total: number;
  total_hpp: number;
  payment_method: PaymentMethod;
  paid_amount: number;
  change_amount: number;
  status: SaleStatus;
  created_at: string;
  sale_items?: SaleItem[];
  refunds?: Refund[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  unit_cost: number;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface ExpenseCategory {
  id: string;
  store_id: string;
  name: string;
}

export interface Expense {
  id: string;
  store_id: string;
  category_id: string | null;
  user_id: string;
  amount: number;
  description: string | null;
  expense_date: string;
  created_at: string;
  expense_category?: ExpenseCategory | null;
}

export interface Refund {
  id: string;
  sale_id: string;
  user_id: string;
  reason: string;
  refund_amount: number;
  created_at: string;
}

export interface TableOrderRow {
  id: string;
  store_id: string | null;
  store_slug: string | null;
  table_number: string;
  customer_name: string | null;
  items: any;
  total_amount: number;
  status: string;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      stores: { Row: Store; Insert: Partial<Store>; Update: Partial<Store> };
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      categories: { Row: Category; Insert: Partial<Category>; Update: Partial<Category> };
      products: { Row: Product; Insert: Partial<Product>; Update: Partial<Product> };
      inventory_logs: { Row: InventoryLog; Insert: Partial<InventoryLog>; Update: Partial<InventoryLog> };
      sales: { Row: Sale; Insert: Partial<Sale>; Update: Partial<Sale> };
      sale_items: { Row: SaleItem; Insert: Partial<SaleItem>; Update: Partial<SaleItem> };
      expense_categories: { Row: ExpenseCategory; Insert: Partial<ExpenseCategory>; Update: Partial<ExpenseCategory> };
      expenses: { Row: Expense; Insert: Partial<Expense>; Update: Partial<Expense> };
      refunds: { Row: Refund; Insert: Partial<Refund>; Update: Partial<Refund> };
      table_orders: { Row: TableOrderRow; Insert: Partial<TableOrderRow>; Update: Partial<TableOrderRow> };
    };
  };
}
