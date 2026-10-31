export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MARKETING';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  created_at?: string;
}

export interface Product {
  id: number;
  name: string;
  unit: string;
  current_stock?: number;
  stock?: number;
  price_per_unit?: number;
  price?: number;
  created_at?: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  address?: string;
  payment_terms?: string;
  total_remaining_debt?: number;
  total_customer_debt?: number;
  created_at?: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name?: string;
  total_amount: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  created_by?: string;
  notes?: string;
  created_at: string;
  items?: OrderItem[];
  invoice?: Invoice;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  order_id: number;
  customer_id: number;
  customer_name?: string;
  payment_type: 'CASH' | 'TRANSFER' | 'CREDIT';
  amount_due: number;
  amount_paid: number;
  status: 'GANTUNG' | 'LUNAS';
  due_date?: string | null;
  transfer_date?: string | null;
  notes?: string;
  created_at: string;
}

export interface Payment {
  id: number;
  payment_number: string;
  invoice_id: number;
  customer_id: number;
  amount: number;
  payment_method: string;
  is_validated: boolean;
  validated_at?: string;
  created_at: string;
}

export type MovementType = 'BARANG_MASUK' | 'PENJUALAN' | 'PENYESUAIAN';

export interface StockMovement {
  id: number;
  product_id: number;
  product_name?: string;
  unit?: string;
  movement_type: MovementType;
  quantity: number;
  damaged_qty: number;
  physical_stock: number | null;
  adjustment_qty: number;
  balance_after: number;
  reference_id?: string;
  notes?: string;
  price?: number;
  price_per_unit?: number;
  created_at: string;
}

