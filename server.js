// PCBang - Express backend serving static assets + MySQL JSON API.

require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const { pool, initializeDatabase } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => {
      const category = req.query.category || "Uncategorized";
      const categoryDir = path.join(__dirname, "public", "img", category);
      fs.mkdirSync(categoryDir, { recursive: true });
      callback(null, categoryDir);
    },
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype));
  }
});

// Admin auth (hardcoded credentials + static bearer token, per project spec)
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
const ADMIN_TOKEN = "pcbang-admin-session-token";

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized. Please log in again." });
  }
  next();
}

async function getAuthenticatedUser(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const [rows] = await pool.query(
    `SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`, [token]
  );
  return rows[0] || null;
}

async function requireUser(req, res, next) {
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Please log in to continue." });
  req.user = user;
  next();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash).split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, age: user.age, address: user.address, phone: user.phone };
}

function normalizeImageName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveCatalogImage(product) {
  if (product.image && /^(https?:\/\/|\/)/i.test(product.image)) return product.image;
  const imageRoot = path.join(__dirname, "public", "img");
  const categoryName = fs.readdirSync(imageRoot, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.toLowerCase() === String(product.category || "").toLowerCase())?.name;
  if (!categoryName) return null;
  const productName = normalizeImageName(product.title);
  const imageFile = fs.readdirSync(path.join(imageRoot, categoryName))
    .filter((file) => /\.(jpe?g|png|webp|gif)$/i.test(file))
    .sort((left, right) => normalizeImageName(right).length - normalizeImageName(left).length)
    .find((file) => {
      const fileName = normalizeImageName(path.parse(file).name);
      return fileName === productName || productName.includes(fileName) || fileName.includes(productName);
    });
  return imageFile ? `/img/${encodeURIComponent(categoryName)}/${encodeURIComponent(imageFile)}` : null;
}

app.post("/api/admin/upload-image", requireAdmin, imageUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Please choose a PNG, JPG, WEBP, or GIF image under 5MB." });
  const category = req.query.category || "Uncategorized";
  res.status(201).json({ url: `/img/${category}/${req.file.filename}` });
});

// Public API
app.get("/api/categories", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT id, name, icon FROM categories ORDER BY name");
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.get("/api/products", async (req, res, next) => {
  const { category, search, flashSale } = req.query;
  const conditions = [];
  const params = [];
  if (category) { conditions.push("p.category_id = ?"); params.push(category); }
  if (flashSale === "true") conditions.push("p.flash_sale = 1");
  if (search) {
    conditions.push("(p.title LIKE ? OR p.specs LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.title, p.category_id AS category, p.price, p.discount_price AS discountPrice,
              p.stock, p.sold, p.rating, p.flash_sale AS flashSale, p.specs, p.image
       FROM products p ${where} ORDER BY p.created_at DESC`, params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

app.get("/api/products/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, category_id AS category, price, discount_price AS discountPrice,
              stock, sold, rating, flash_sale AS flashSale, specs, image
       FROM products WHERE id = ?`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Product not found" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

app.post("/api/auth/signup", async (req, res, next) => {
  const { name, email, password, age, address, phone } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const numericAge = Number(age);
  if (!name || !normalizedEmail || !password || !address || !phone || !Number.isInteger(numericAge) || numericAge < 13 || numericAge > 120) {
    return res.status(400).json({ error: "Name, email, password, age (13-120), address, and phone are required." });
  }
  try {
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existing[0]) return res.status(409).json({ error: "An account with this email already exists." });
    const [result] = await pool.query(
      "INSERT INTO users (name, email, password_hash, age, address, phone) VALUES (?, ?, ?, ?, ?, ?)",
      [String(name).trim(), normalizedEmail, hashPassword(password), numericAge, String(address).trim(), String(phone).trim()]
    );
    res.status(201).json({ message: "Account created successfully." , userId: result.insertId });
  } catch (err) { next(err); }
});

app.post("/api/auth/login", async (req, res, next) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (!rows[0] || !verifyPassword(password, rows[0].password_hash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query("INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", [token, rows[0].id]);
    res.json({ token, user: publicUser(rows[0]) });
  } catch (err) { next(err); }
});

app.get("/api/account", requireUser, async (req, res, next) => {
  try {
    const [users] = await pool.query("SELECT * FROM users WHERE id = ?", [req.user.id]);
    const [orders] = await pool.query(
            `SELECT o.id, o.customer_name AS customerName, o.delivery_address AS deliveryAddress, o.phone,
              o.payment_method AS paymentMethod, o.subtotal, o.total, o.status, o.created_at AS createdAt
       FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC`, [req.user.id]
    );
    if (orders.length) {
      const [items] = await pool.query(
        `SELECT oi.order_id AS orderId, oi.product_id AS productId, oi.product_title AS productTitle,
          oi.unit_price AS unitPrice, oi.quantity, oi.line_total AS lineTotal,
          p.category_id AS category, p.image
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id IN (?) ORDER BY oi.id`, [orders.map((order) => order.id)]
      );
      const itemsByOrder = new Map();
      items.forEach((item) => {
        item.image = resolveCatalogImage(item);
        if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
        itemsByOrder.get(item.orderId).push(item);
      });
      orders.forEach((order) => { order.items = itemsByOrder.get(order.id) || []; });
    }
    res.json({ user: publicUser(users[0]), orders });
  } catch (err) { next(err); }
});

app.post("/api/auth/logout", requireUser, (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  pool.query("DELETE FROM user_sessions WHERE token = ?", [token])
    .then(() => res.json({ success: true }))
    .catch(() => res.status(500).json({ error: "Unable to log out." }));
});

// Admin auth route
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.json({ token: ADMIN_TOKEN, username });
  }
  res.status(401).json({ error: "Invalid username or password." });
});


// Admin API (protected)
// GET dashboard stats
app.get("/api/admin/stats", requireAdmin, async (req, res, next) => {
  try {
    const [[stats]] = await pool.query(`
      SELECT COUNT(*) AS totalProducts,
             COUNT(DISTINCT category_id) AS activeCategories,
             SUM(stock <= 10) AS lowStockAlerts,
             SUM(COALESCE(discount_price, price) * sold) AS totalSales,
             SUM(flash_sale = 1) AS flashSaleCount
      FROM products`);
    res.json({ ...stats, totalSales: stats.totalSales || 0 });
  } catch (err) { next(err); }
});

// GET all products (admin view, unfiltered)
app.get("/api/admin/products", requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, title, category_id AS category, price, discount_price AS discountPrice,
             stock, sold, rating, flash_sale AS flashSale, specs, image
      FROM products ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST create product
app.post("/api/admin/products", requireAdmin, async (req, res, next) => {
  const body = req.body || {};
  if (!body.title || !body.category || !body.price) {
    return res.status(400).json({ error: "Title, category, and price are required." });
  }

  const newProduct = {
    id: `p${Date.now()}`,
    title: body.title,
    category: body.category,
    price: Number(body.price),
    discountPrice: body.discountPrice ? Number(body.discountPrice) : null,
    stock: body.stock !== undefined ? Number(body.stock) : 0,
    sold: body.sold !== undefined ? Number(body.sold) : 0,
    rating: body.rating !== undefined ? Number(body.rating) : 4.5,
    flashSale: !!body.flashSale,
    specs: body.specs || "",
    image: body.image || body.category
  };

  try {
    await pool.query(`
      INSERT INTO products
      (id, title, category_id, price, discount_price, stock, sold, rating, flash_sale, specs, image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newProduct.id, newProduct.title, newProduct.category, newProduct.price, newProduct.discountPrice,
        newProduct.stock, newProduct.sold, newProduct.rating, newProduct.flashSale, newProduct.specs, newProduct.image]
    );
    res.status(201).json(newProduct);
  } catch (err) { next(err); }
});

// PUT update product
app.put("/api/admin/products/:id", requireAdmin, async (req, res, next) => {
  const body = req.body || {};
  try {
    const [result] = await pool.query(`UPDATE products SET
      title = COALESCE(?, title), category_id = COALESCE(?, category_id), price = COALESCE(?, price),
      discount_price = CASE WHEN ? = 1 THEN ? ELSE discount_price END,
      stock = COALESCE(?, stock), sold = COALESCE(?, sold), rating = COALESCE(?, rating),
      flash_sale = COALESCE(?, flash_sale), specs = COALESCE(?, specs), image = COALESCE(?, image)
      WHERE id = ?`, [
      body.title, body.category, body.price !== undefined ? Number(body.price) : null,
      body.discountPrice !== undefined,
      body.discountPrice === undefined || body.discountPrice === "" ? null : Number(body.discountPrice),
      body.stock !== undefined ? Number(body.stock) : null, body.sold !== undefined ? Number(body.sold) : null,
      body.rating !== undefined ? Number(body.rating) : null, body.flashSale === undefined ? null : !!body.flashSale,
      body.specs, body.image, req.params.id
    ]);
    if (!result.affectedRows) return res.status(404).json({ error: "Product not found" });
    const [rows] = await pool.query(`SELECT id, title, category_id AS category, price, discount_price AS discountPrice,
      stock, sold, rating, flash_sale AS flashSale, specs, image FROM products WHERE id = ?`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE product
app.delete("/api/admin/products/:id", requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT id, title FROM products WHERE id = ?", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Product not found" });
    await pool.query("DELETE FROM products WHERE id = ?", [req.params.id]);
    res.json({ success: true, removed: rows[0] });
  } catch (err) { next(err); }
});

// POST creates an order and reserves stock atomically.
app.post("/api/orders", async (req, res, next) => {
  const { customerName, deliveryAddress, phone, paymentMethod, items } = req.body || {};
  if (!customerName || !deliveryAddress || !phone || !paymentMethod || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Customer details and at least one cart item are required." });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const orderItems = [];
    let subtotal = 0;
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!item.productId || !Number.isInteger(quantity) || quantity < 1) {
        throw Object.assign(new Error("Invalid order item."), { status: 400 });
      }
      const [rows] = await connection.query(
        `SELECT id, title, price, discount_price AS discountPrice, stock
         FROM products WHERE id = ? FOR UPDATE`, [item.productId]
      );
      const product = rows[0];
      if (!product) throw Object.assign(new Error("A product in your cart no longer exists."), { status: 400 });
      if (product.stock < quantity) throw Object.assign(new Error(`${product.title} has insufficient stock.`), { status: 409 });
      const unitPrice = product.discountPrice || product.price;
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      orderItems.push({ product, quantity, unitPrice, lineTotal });
    }

    const [orderResult] = await connection.query(
      `INSERT INTO orders (user_id, customer_name, delivery_address, phone, payment_method, subtotal, total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [(await getAuthenticatedUser(req))?.id || null, customerName, deliveryAddress, phone, paymentMethod, subtotal, subtotal]
    );
    for (const item of orderItems) {
      await connection.query(
        `INSERT INTO order_items (order_id, product_id, product_title, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderResult.insertId, item.product.id, item.product.title, item.unitPrice, item.quantity, item.lineTotal]
      );
      await connection.query("UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ?",
        [item.quantity, item.quantity, item.product.id]);
    }
    await connection.commit();
    res.status(201).json({ orderId: orderResult.insertId, total: subtotal });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
});

// HTML routes
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "store.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : "Internal server error." });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  PCBang server running at http://localhost:${PORT}`);
      console.log(`  Admin dashboard at   http://localhost:${PORT}/admin`);
      console.log(`  Admin login: admin / admin123\n`);
    });
  })
  .catch((err) => {
    console.error("Unable to initialize MySQL. Import database.sql and check DB_* settings.", err.message);
    process.exitCode = 1;
  });
