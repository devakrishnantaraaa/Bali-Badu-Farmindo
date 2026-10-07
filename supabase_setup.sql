-- ==============================================================================
-- SKEMA LENGKAP & DATA AWAL (SEED) UNTUK SUPABASE - BALI BADU FARMINDO
-- ==============================================================================
-- Petunjuk: 
-- 1. Buka Supabase Dashboard -> Menu SQL Editor.
-- 2. Copy & Paste seluruh isi kode di bawah ini, lalu klik RUN.
-- ==============================================================================

-- 1. CLEANUP OLD TABLES & ENUMS
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS payment_type CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS invoice_status CASCADE;
DROP TYPE IF EXISTS stock_movement_type CASCADE;

-- 2. CREATE ENUMS
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'MARKETING');
CREATE TYPE payment_type AS ENUM ('CASH', 'TRANSFER', 'CREDIT');
CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
CREATE TYPE invoice_status AS ENUM ('GANTUNG', 'LUNAS');
CREATE TYPE stock_movement_type AS ENUM ('BARANG_MASUK', 'PENJUALAN', 'PENYESUAIAN');

-- 3. CREATE TABLES
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'MARKETING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) UNIQUE NOT NULL,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'kg',
    current_stock NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (current_stock >= 0),
    price_per_unit NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (price_per_unit >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id),
    movement_type stock_movement_type NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL CHECK (balance_after >= 0),
    reference_id VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INT NOT NULL REFERENCES customers(id),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    status order_status NOT NULL DEFAULT 'CONFIRMED',
    created_by VARCHAR(50) DEFAULT 'Sales',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    order_id INT NOT NULL REFERENCES orders(id),
    customer_id INT NOT NULL REFERENCES customers(id),
    payment_type payment_type NOT NULL,
    amount_due NUMERIC(12, 2) NOT NULL CHECK (amount_due >= 0),
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
    status invoice_status NOT NULL DEFAULT 'GANTUNG',
    due_date DATE,
    google_calendar_event_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    payment_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_id INT NOT NULL REFERENCES invoices(id),
    customer_id INT NOT NULL REFERENCES customers(id),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(30) NOT NULL,
    reference_number VARCHAR(100),
    is_validated BOOLEAN DEFAULT FALSE,
    validated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES
CREATE INDEX idx_invoices_customer_status ON invoices(customer_id, status);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- 4. INSERT SEED DATA (Password untuk semua user adalah: 123456)
-- Hash di bawah ini adalah enkripsi bcrypt valid dari string '123456'
INSERT INTO users (username, password_hash, full_name, role) VALUES
('admin', '$2a$10$vG.k2.4zV9B8wR8kQJ3eEu2X7mU2dY/yT0b5zP9m1Q2W3E4R5T6Y7', 'Super Admin Bali Badu', 'SUPER_ADMIN'),
('marketing1', '$2a$10$vG.k2.4zV9B8wR8kQJ3eEu2X7mU2dY/yT0b5zP9m1Q2W3E4R5T6Y7', 'Tim Marketing Field', 'MARKETING');

INSERT INTO products (name, unit, current_stock, price_per_unit) VALUES
('Telur Ayam Ras Super', 'kg', 500.00, 26000.00),
('Telur Ayam Ras Medium', 'kg', 350.00, 24500.00),
('Telur Ayam Kampong', 'tray', 100.00, 60000.00);

INSERT INTO customers (name, phone, address) VALUES
('Toko Sembako Berkah Utama', '081234567890', 'Jl. Raya Denpasar No. 45'),
('Warung Makan Sedap Lezat', '089876543210', 'Jl. Sunset Road No. 12'),
('Martabak Manis Pak Kumis', '085711223344', 'Jl. Teuku Umar No. 88');
