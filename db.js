const mysql = require("mysql2/promise");
const { categories, getProducts } = require("./data");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "pcbang",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
});

async function initializeDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        age TINYINT UNSIGNED NOT NULL,
        address VARCHAR(500) NOT NULL,
        phone VARCHAR(40) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token CHAR(64) PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_sessions_user (user_id)
      )`);
    const [orderUserColumn] = await connection.query(
      `SELECT COUNT(*) AS count FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'user_id'`
    );
    if (!orderUserColumn[0].count) {
      await connection.query("ALTER TABLE orders ADD COLUMN user_id BIGINT UNSIGNED NULL");
    }
    const [orderUserIndex] = await connection.query(
      `SELECT COUNT(*) AS count FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'idx_orders_user'`
    );
    if (!orderUserIndex[0].count) {
      await connection.query("ALTER TABLE orders ADD INDEX idx_orders_user (user_id)");
    }

    await connection.query(
      `INSERT IGNORE INTO categories (id, name, icon) VALUES ${categories.map(() => "(?, ?, ?)").join(",")}`,
      categories.flatMap((category) => [category.id, category.name, category.icon])
    );

    const products = getProducts();
    await connection.query(
      `INSERT IGNORE INTO products
       (id, title, category_id, price, discount_price, stock, sold, rating, flash_sale, specs, image)
       VALUES ${products.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",")}`,
      products.flatMap((product) => [
        product.id, product.title, product.category, product.price, product.discountPrice,
        product.stock, product.sold, product.rating, product.flashSale, product.specs, product.image
      ])
    );
  } finally {
    connection.release();
  }
}

module.exports = { pool, initializeDatabase };
