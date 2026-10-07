const db = require('./src/config/db');
const bcrypt = require('bcryptjs');

async function seedData() {
    try {
        console.log('--- Inisialisasi Data Awal (Seeding) ---');
        
        // 1. Password default '123456' untuk semua role demo
        const defaultPasswordHash = await bcrypt.hash('123456', 10);

        // 2. Insert Users
        const users = [
            { username: 'admin', name: 'Super Administrator', role: 'SUPER_ADMIN' },
            { username: 'marketing1', name: 'Tim Marketing Field', role: 'MARKETING' }
        ];

        for (const u of users) {
            await db.query(
                `INSERT INTO users (username, password_hash, full_name, role)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (username) DO UPDATE 
                 SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name`,
                [u.username, defaultPasswordHash, u.name, u.role]
            );
            console.log(`✓ User '${u.username}' (${u.role}) berhasil disiapkan (Password: 123456).`);
        }

        // 3. Insert Products
        const products = [
            { name: 'Telur Ayam Ras Super', unit: 'kg', stock: 500, price: 26000 },
            { name: 'Telur Ayam Ras Medium', unit: 'kg', stock: 350, price: 24500 },
            { name: 'Telur Ayam Kampong', unit: 'tray', stock: 100, price: 60000 }
        ];

        for (const p of products) {
            await db.query(
                `INSERT INTO products (name, unit, current_stock, price_per_unit)
                 VALUES ($1, $2, $3, $4)`,
                [p.name, p.unit, p.stock, p.price]
            );
            console.log(`✓ Produk '${p.name}' disiapkan dengan stok ${p.stock} ${p.unit}.`);
        }

        // 4. Insert Customers
        const customers = [
            { name: 'Toko Sembako Berkah Utama', phone: '081234567890', address: 'Jl. Raya Denpasar No. 45' },
            { name: 'Warung Makan Sedap Lezat', phone: '089876543210', address: 'Jl. Sunset Road No. 12' },
            { name: 'Martabak Manis Pak Kumis', phone: '085711223344', address: 'Jl. Teuku Umar No. 88' }
        ];

        for (const c of customers) {
            await db.query(
                `INSERT INTO customers (name, phone, address)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (phone) DO NOTHING`,
                [c.name, c.phone, c.address]
            );
            console.log(`✓ Customer '${c.name}' disiapkan.`);
        }

        console.log('\n--- Inisialisasi Data Selesai & Sukses! ---');
        process.exit(0);

    } catch (error) {
        console.error('Seeding Error:', error.message);
        process.exit(1);
    }
}

seedData();
