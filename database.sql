CREATE DATABASE IF NOT EXISTS pcbang CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pcbang;

CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(32) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category_id VARCHAR(32) NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  discount_price DECIMAL(12,2) NULL,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  sold INT UNSIGNED NOT NULL DEFAULT 0,
  rating DECIMAL(2,1) NOT NULL DEFAULT 4.5,
  flash_sale BOOLEAN NOT NULL DEFAULT FALSE,
  specs TEXT NULL,
  image VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id),
  INDEX idx_products_category (category_id),
  INDEX idx_products_flash_sale (flash_sale),
  FULLTEXT INDEX idx_products_search (title, specs)
);

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
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token CHAR(64) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_sessions_user (user_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(150) NOT NULL,
  delivery_address VARCHAR(500) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  status ENUM('pending','paid','processing','shipped','completed','cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orders_status_created (status, created_at),
  INDEX idx_orders_user (user_id),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id VARCHAR(32) NOT NULL,
  product_title VARCHAR(255) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_order_items_order (order_id)
);
