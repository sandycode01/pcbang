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
const UPLOADS_DIR = path.join(__dirname, "uploads");

app.use(express.json());
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "public")));

function normalizeUploadCategory(category) {
  return String(category || "Uncategorized")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "Uncategorized";
}

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => {
      const categoryDir = path.join(UPLOADS_DIR, normalizeUploadCategory(req.query.category));
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
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: "Please log in to continue." });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
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

function serializeProduct(row) {
  const {
    compatibilityCpuSocket,
    compatibilityMemoryType,
    compatibilityMotherboardFormFactor,
    compatibilitySupportedFormFactors,
    compatibilityGpuLengthMm,
    compatibilityMaxGpuLengthMm,
    ...product
  } = row;
  return {
    ...product,
    compatibility: {
      cpuSocket: compatibilityCpuSocket || "",
      memoryType: compatibilityMemoryType || "",
      motherboardFormFactor: compatibilityMotherboardFormFactor || "",
      supportedFormFactors: compatibilitySupportedFormFactors
        ? compatibilitySupportedFormFactors.split(",").map((value) => value.trim()).filter(Boolean)
        : [],
      gpuLengthMm: compatibilityGpuLengthMm === null || compatibilityGpuLengthMm === undefined
        ? "" : Number(compatibilityGpuLengthMm),
      maxGpuLengthMm: compatibilityMaxGpuLengthMm === null || compatibilityMaxGpuLengthMm === undefined
        ? "" : Number(compatibilityMaxGpuLengthMm)
    }
  };
}

function normalizeCompatibility(value) {
  const body = value || {};
  const text = (key, maxLength) => {
    const result = String(body[key] ?? "").trim();
    if (result.length > maxLength) throw Object.assign(new Error(`${key} must be ${maxLength} characters or fewer.`), { status: 400 });
    return result || null;
  };
  const measurement = (key) => {
    if (body[key] === "" || body[key] === null || body[key] === undefined) return null;
    const valueNumber = Number(body[key]);
    if (!Number.isInteger(valueNumber) || valueNumber < 1 || valueNumber > 1000) {
      throw Object.assign(new Error(`${key} must be a whole number between 1 and 1000.`), { status: 400 });
    }
    return valueNumber;
  };
  const formFactors = Array.isArray(body.supportedFormFactors)
    ? body.supportedFormFactors
    : String(body.supportedFormFactors || "").split(",");
  const allowedFormFactors = new Map([
    ["atx", "ATX"],
    ["micro-atx", "Micro-ATX"],
    ["matx", "Micro-ATX"],
    ["mini-itx", "Mini-ITX"],
    ["mitx", "Mini-ITX"],
    ["e-atx", "E-ATX"],
    ["eatx", "E-ATX"]
  ]);
  const supported = [...new Set(formFactors.map((factor) => {
    const normalized = allowedFormFactors.get(String(factor).trim().toLowerCase());
    if (!normalized && String(factor).trim()) {
      throw Object.assign(new Error("Supported form factors may include ATX, Micro-ATX, Mini-ITX, and E-ATX."), { status: 400 });
    }
    return normalized;
  }).filter(Boolean))];

  return {
    cpuSocket: text("cpuSocket", 40),
    memoryType: text("memoryType", 20),
    motherboardFormFactor: text("motherboardFormFactor", 40),
    supportedFormFactors: supported.length ? supported.join(", ") : null,
    gpuLengthMm: measurement("gpuLengthMm"),
    maxGpuLengthMm: measurement("maxGpuLengthMm")
  };
}

async function saveProductCompatibility(connection, productId, compatibility) {
  const values = [
    compatibility.cpuSocket,
    compatibility.memoryType,
    compatibility.motherboardFormFactor,
    compatibility.supportedFormFactors,
    compatibility.gpuLengthMm,
    compatibility.maxGpuLengthMm
  ];
  if (values.every((value) => value === null)) {
    await connection.query("DELETE FROM product_compatibility WHERE product_id = ?", [productId]);
    return;
  }
  await connection.query(`
    INSERT INTO product_compatibility
      (product_id, cpu_socket, memory_type, motherboard_form_factor, supported_form_factors, gpu_length_mm, max_gpu_length_mm)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      cpu_socket = VALUES(cpu_socket),
      memory_type = VALUES(memory_type),
      motherboard_form_factor = VALUES(motherboard_form_factor),
      supported_form_factors = VALUES(supported_form_factors),
      gpu_length_mm = VALUES(gpu_length_mm),
      max_gpu_length_mm = VALUES(max_gpu_length_mm)`,
    [productId, ...values]);
}

async function getFlashSaleEndTime() {
  const [[setting]] = await pool.query("SELECT ends_at_ms AS endsAt FROM flash_sale_settings WHERE id = 1");
  return setting?.endsAt === null || setting?.endsAt === undefined ? null : Number(setting.endsAt);
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
  const category = normalizeUploadCategory(req.query.category);
  res.status(201).json({ url: `/uploads/${category}/${req.file.filename}` });
});

// Public API
app.get("/api/flash-sale", async (req, res, next) => {
  try {
    const endsAt = await getFlashSaleEndTime();
    res.set("Cache-Control", "no-store");
    res.json({ endsAt, active: endsAt !== null && endsAt > Date.now() });
  } catch (err) { next(err); }
});

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
  let campaignActive = false;
  try {
    const endsAt = await getFlashSaleEndTime();
    campaignActive = endsAt !== null && endsAt > Date.now();
  } catch (err) {
    return next(err);
  }
  if (category) { conditions.push("p.category_id = ?"); params.push(category); }
  if (flashSale === "true") conditions.push(campaignActive ? "p.flash_sale = 1" : "1 = 0");
  if (search) {
    conditions.push("(p.title LIKE ? OR p.specs LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.title, p.category_id AS category, p.price, p.discount_price AS discountPrice,
              p.sale_price AS salePrice,
              p.stock, p.sold, p.rating, p.flash_sale AS flashSale, p.specs, p.image,
              pc.cpu_socket AS compatibilityCpuSocket, pc.memory_type AS compatibilityMemoryType,
              pc.motherboard_form_factor AS compatibilityMotherboardFormFactor,
              pc.supported_form_factors AS compatibilitySupportedFormFactors,
              pc.gpu_length_mm AS compatibilityGpuLengthMm,
              pc.max_gpu_length_mm AS compatibilityMaxGpuLengthMm
       FROM products p LEFT JOIN product_compatibility pc ON pc.product_id = p.id
       ${where} ORDER BY p.created_at DESC`, params
    );
    res.json(rows.map((product) => serializeProduct({
      ...product,
      flashSale: campaignActive && !!product.flashSale
    })));
  } catch (err) { next(err); }
});

app.get("/api/products/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, category_id AS category, price, discount_price AS discountPrice,
              sale_price AS salePrice, stock, sold, rating, flash_sale AS flashSale, specs, image,
              pc.cpu_socket AS compatibilityCpuSocket, pc.memory_type AS compatibilityMemoryType,
              pc.motherboard_form_factor AS compatibilityMotherboardFormFactor,
              pc.supported_form_factors AS compatibilitySupportedFormFactors,
              pc.gpu_length_mm AS compatibilityGpuLengthMm,
              pc.max_gpu_length_mm AS compatibilityMaxGpuLengthMm
       FROM products p LEFT JOIN product_compatibility pc ON pc.product_id = p.id
       WHERE p.id = ?`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Product not found" });
    const endsAt = await getFlashSaleEndTime();
    res.json(serializeProduct({
      ...rows[0],
      flashSale: endsAt !== null && endsAt > Date.now() && !!rows[0].flashSale
    }));
  } catch (err) { next(err); }
});

app.get("/api/pc-builder/products", async (req, res, next) => {
  try {
    const endsAt = await getFlashSaleEndTime();
    const flashSaleActive = endsAt !== null && endsAt > Date.now();
    const [rows] = await pool.query(`
      SELECT p.id, p.title, p.category_id AS category, p.price,
             p.discount_price AS discountPrice, p.sale_price AS salePrice,
             p.flash_sale AS flashSale, p.stock, p.image,
             c.name AS categoryName,
             pc.cpu_socket AS compatibilityCpuSocket, pc.memory_type AS compatibilityMemoryType,
             pc.motherboard_form_factor AS compatibilityMotherboardFormFactor,
             pc.supported_form_factors AS compatibilitySupportedFormFactors,
             pc.gpu_length_mm AS compatibilityGpuLengthMm,
             pc.max_gpu_length_mm AS compatibilityMaxGpuLengthMm
      FROM products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_compatibility pc ON pc.product_id = p.id
      WHERE p.category_id IN ('cpu', 'mobo', 'ram', 'gpu', 'case')
      ORDER BY p.category_id, p.title`);
    res.json(rows.map((row) => {
      const product = serializeProduct({
        ...row,
        flashSale: flashSaleActive && !!row.flashSale
      });
      product.image = resolveCatalogImage({ ...product, category: row.categoryName });
      delete product.categoryName;
      return product;
    }));
  } catch (err) { next(err); }
});

app.post("/api/pc-builder/check", async (req, res, next) => {
  const selections = req.body || {};
  const selectionKeys = ["cpuId", "motherboardId", "ramId", "gpuId", "caseId"];
  for (const key of selectionKeys) {
    if (selections[key] !== undefined && selections[key] !== null &&
        (typeof selections[key] !== "string" || selections[key].length > 32)) {
      return res.status(400).json({ error: "Invalid component selection." });
    }
  }

  const ids = selectionKeys.map((key) => selections[key]).filter(Boolean);
  try {
    const [rows] = ids.length ? await pool.query(`
      SELECT p.id, p.title, p.category_id AS category,
             pc.cpu_socket AS compatibilityCpuSocket, pc.memory_type AS compatibilityMemoryType,
             pc.motherboard_form_factor AS compatibilityMotherboardFormFactor,
             pc.supported_form_factors AS compatibilitySupportedFormFactors,
             pc.gpu_length_mm AS compatibilityGpuLengthMm,
             pc.max_gpu_length_mm AS compatibilityMaxGpuLengthMm
      FROM products p LEFT JOIN product_compatibility pc ON pc.product_id = p.id
      WHERE p.id IN (?)`, [ids]) : [[]];
    const selected = new Map(rows.map((row) => [row.id, serializeProduct(row)]));
    const expectedCategories = {
      cpuId: "cpu",
      motherboardId: "mobo",
      ramId: "ram",
      gpuId: "gpu",
      caseId: "case"
    };
    for (const key of selectionKeys) {
      const id = selections[key];
      if (id && (!selected.has(id) || selected.get(id).category !== expectedCategories[key])) {
        return res.status(400).json({ error: "One or more selected components are unavailable or do not match their component type." });
      }
    }

    const cpu = selected.get(selections.cpuId);
    const motherboard = selected.get(selections.motherboardId);
    const ram = selected.get(selections.ramId);
    const gpu = selected.get(selections.gpuId);
    const pcCase = selected.get(selections.caseId);
    const checks = [];
    const compare = (label, leftProduct, leftValue, rightProduct, rightValue, description) => {
      if (!leftProduct || !rightProduct) return;
      if (!leftValue || !rightValue) {
        checks.push({ label, status: "unknown", message: `Not enough product data to verify ${description}.` });
      } else if (String(leftValue).trim().toLowerCase() === String(rightValue).trim().toLowerCase()) {
        checks.push({ label, status: "compatible", message: `${leftProduct.title} and ${rightProduct.title} match (${leftValue}).` });
      } else {
        checks.push({ label, status: "incompatible", message: `${leftProduct.title} uses ${leftValue}, but ${rightProduct.title} requires ${rightValue}.` });
      }
    };

    compare("CPU socket", cpu, cpu?.compatibility.cpuSocket, motherboard,
      motherboard?.compatibility.cpuSocket, "CPU and motherboard socket");
    compare("Memory generation", motherboard, motherboard?.compatibility.memoryType, ram,
      ram?.compatibility.memoryType, "motherboard and RAM generation");

    if (motherboard && pcCase) {
      const supported = pcCase.compatibility.supportedFormFactors;
      const boardFormFactor = motherboard.compatibility.motherboardFormFactor;
      if (!supported.length || !boardFormFactor) {
        checks.push({ label: "Motherboard / case fit", status: "unknown", message: "Not enough product data to verify motherboard and case form-factor support." });
      } else if (supported.some((factor) => factor.toLowerCase() === boardFormFactor.toLowerCase())) {
        checks.push({ label: "Motherboard / case fit", status: "compatible", message: `${pcCase.title} supports ${boardFormFactor} motherboards.` });
      } else {
        checks.push({ label: "Motherboard / case fit", status: "incompatible", message: `${pcCase.title} does not list support for ${boardFormFactor} motherboards.` });
      }
    }

    if (gpu && pcCase) {
      const gpuLength = Number(gpu.compatibility.gpuLengthMm);
      const caseClearance = Number(pcCase.compatibility.maxGpuLengthMm);
      if (!gpuLength || !caseClearance) {
        checks.push({ label: "Graphics card clearance", status: "unknown", message: "Not enough product data to verify graphics-card length against case clearance." });
      } else if (gpuLength <= caseClearance) {
        checks.push({ label: "Graphics card clearance", status: "compatible", message: `${gpuLength} mm graphics card fits within the case's ${caseClearance} mm clearance.` });
      } else {
        checks.push({ label: "Graphics card clearance", status: "incompatible", message: `${gpuLength} mm graphics card exceeds the case's ${caseClearance} mm clearance.` });
      }
    }

    const allPartsSelected = selectionKeys.every((key) => selections[key]);
    const hasMismatch = checks.some((check) => check.status === "incompatible");
    const hasUnknown = checks.some((check) => check.status === "unknown");
    const overall = hasMismatch ? "incompatible" :
      !allPartsSelected || checks.length < 4 || hasUnknown ? "incomplete" : "compatible";
    res.json({ overall, checks });
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
             SUM(flash_sale = 1) AS flashSaleCount
      FROM products`);
    const [monthlySales] = await pool.query(`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month,
             SUM(total) AS totalSales,
             COUNT(*) AS orderCount
      FROM orders
      WHERE status IN ('paid', 'processing', 'shipped', 'on_the_way', 'completed')
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month DESC`);
    const [[currentMonth]] = await pool.query(
      "SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m') AS month"
    );
    const currentMonthSales = monthlySales.find((entry) => entry.month === currentMonth.month);
    res.json({
      ...stats,
      totalSales: currentMonthSales ? Number(currentMonthSales.totalSales) : 0,
      currentMonth: currentMonth.month,
      monthlySales
    });
  } catch (err) { next(err); }
});

// GET all products (admin view, unfiltered)
app.get("/api/admin/products", requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, title, category_id AS category, price, discount_price AS discountPrice,
             sale_price AS salePrice,
             stock, sold, rating, flash_sale AS flashSale, specs, image,
             pc.cpu_socket AS compatibilityCpuSocket, pc.memory_type AS compatibilityMemoryType,
             pc.motherboard_form_factor AS compatibilityMotherboardFormFactor,
             pc.supported_form_factors AS compatibilitySupportedFormFactors,
             pc.gpu_length_mm AS compatibilityGpuLengthMm,
             pc.max_gpu_length_mm AS compatibilityMaxGpuLengthMm
      FROM products p LEFT JOIN product_compatibility pc ON pc.product_id = p.id
      ORDER BY p.created_at DESC`);
    res.json(rows.map(serializeProduct));
  } catch (err) { next(err); }
});

app.get("/api/admin/flash-sale", requireAdmin, async (req, res, next) => {
  try {
    const endsAt = await getFlashSaleEndTime();
    res.json({ endsAt, active: endsAt !== null && endsAt > Date.now() });
  } catch (err) { next(err); }
});

app.put("/api/admin/flash-sale", requireAdmin, async (req, res, next) => {
  const { endsAt } = req.body || {};
  let endTime = null;
  if (endsAt !== null && endsAt !== "") {
    endTime = Number(endsAt);
    if (!Number.isSafeInteger(endTime) || endTime <= Date.now()) {
      return res.status(400).json({ error: "Choose a flash sale end time in the future." });
    }
  }

  try {
    await pool.query("UPDATE flash_sale_settings SET ends_at_ms = ? WHERE id = 1", [endTime]);
    res.json({ endsAt: endTime, active: endTime !== null });
  } catch (err) { next(err); }
});

// GET all customer orders for the admin dashboard.
app.get("/api/admin/orders", requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, customer_name AS customerName, delivery_address AS deliveryAddress,
             phone, payment_method AS paymentMethod, total, status, created_at AS createdAt
      FROM orders
      ORDER BY created_at DESC, id DESC`);
    res.json(rows);
  } catch (err) { next(err); }
});

app.put("/api/admin/orders/:id/status", requireAdmin, async (req, res, next) => {
  const orderId = Number(req.params.id);
  const status = req.body?.status;
  const allowedStatuses = new Set([
    "pending", "paid", "processing", "shipped", "on_the_way",
    "completed", "cancelled", "returned"
  ]);
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: "Invalid order ID." });
  }
  if (typeof status !== "string" || !allowedStatuses.has(status)) {
    return res.status(400).json({ error: "Choose a valid order status." });
  }

  try {
    await pool.query("UPDATE orders SET status = ? WHERE id = ?", [status, orderId]);
    const [rows] = await pool.query(
      "SELECT id, status FROM orders WHERE id = ?",
      [orderId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Order not found." });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST create product
app.post("/api/admin/products", requireAdmin, async (req, res, next) => {
  const body = req.body || {};
  if (!body.title || !body.category || !body.price) {
    return res.status(400).json({ error: "Title, category, and price are required." });
  }
  let compatibility;
  try {
    compatibility = normalizeCompatibility(body.compatibility);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
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
    image: body.image || body.category,
    compatibility: {
      cpuSocket: compatibility.cpuSocket || "",
      memoryType: compatibility.memoryType || "",
      motherboardFormFactor: compatibility.motherboardFormFactor || "",
      supportedFormFactors: compatibility.supportedFormFactors
        ? compatibility.supportedFormFactors.split(",").map((value) => value.trim())
        : [],
      gpuLengthMm: compatibility.gpuLengthMm || "",
      maxGpuLengthMm: compatibility.maxGpuLengthMm || ""
    }
  };

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query(`
      INSERT INTO products
      (id, title, category_id, price, discount_price, stock, sold, rating, flash_sale, specs, image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newProduct.id, newProduct.title, newProduct.category, newProduct.price, newProduct.discountPrice,
        newProduct.stock, newProduct.sold, newProduct.rating, newProduct.flashSale, newProduct.specs, newProduct.image]
    );
    await saveProductCompatibility(connection, newProduct.id, compatibility);
    await connection.commit();
    res.status(201).json(newProduct);
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
});

// PUT update product
app.put("/api/admin/products/:id", requireAdmin, async (req, res, next) => {
  const body = req.body || {};
  const hasCompatibility = Object.prototype.hasOwnProperty.call(body, "compatibility");
  let compatibility;
  try {
    if (hasCompatibility) compatibility = normalizeCompatibility(body.compatibility);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const [currentRows] = await connection.query(
      "SELECT price, discount_price AS discountPrice, sale_price AS salePrice FROM products WHERE id = ?",
      [req.params.id]
    );
    if (!currentRows[0]) return res.status(404).json({ error: "Product not found" });

    let salePrice = null;
    const validatesPriceRelationship = body.salePrice !== undefined ||
      body.price !== undefined || body.discountPrice !== undefined;
    if (validatesPriceRelationship) {
      if (body.salePrice !== null && body.salePrice !== "") {
        if (body.salePrice !== undefined) salePrice = Number(body.salePrice);
        if (salePrice !== null && (!Number.isFinite(salePrice) || salePrice <= 0)) {
          return res.status(400).json({ error: "Sale price must be a positive amount or left blank." });
        }
      }
      const regularPrice = Number(body.price ?? currentRows[0].price);
      const discountPrice = body.discountPrice !== undefined
        ? (body.discountPrice === "" || body.discountPrice === null ? null : Number(body.discountPrice))
        : Number(currentRows[0].discountPrice);
      const productBasePrice = Number(discountPrice) || regularPrice;
      const resultingSalePrice = body.salePrice === undefined ? Number(currentRows[0].salePrice) : salePrice;
      if (Number.isFinite(resultingSalePrice) && resultingSalePrice > 0 &&
          (!Number.isFinite(productBasePrice) || resultingSalePrice >= productBasePrice)) {
        return res.status(400).json({ error: "Sale price must be lower than the product's regular selling price." });
      }
    }

    await connection.beginTransaction();
    await connection.query(`UPDATE products SET
      title = COALESCE(?, title), category_id = COALESCE(?, category_id), price = COALESCE(?, price),
      discount_price = CASE WHEN ? = 1 THEN ? ELSE discount_price END,
      sale_price = CASE WHEN ? = 1 THEN ? ELSE sale_price END,
      stock = COALESCE(?, stock), sold = COALESCE(?, sold), rating = COALESCE(?, rating),
      flash_sale = COALESCE(?, flash_sale), specs = COALESCE(?, specs), image = COALESCE(?, image)
      WHERE id = ?`, [
      body.title, body.category, body.price !== undefined ? Number(body.price) : null,
      body.discountPrice !== undefined,
      body.discountPrice === undefined || body.discountPrice === "" ? null : Number(body.discountPrice),
      body.salePrice !== undefined, salePrice,
      body.stock !== undefined ? Number(body.stock) : null, body.sold !== undefined ? Number(body.sold) : null,
      body.rating !== undefined ? Number(body.rating) : null, body.flashSale === undefined ? null : !!body.flashSale,
      body.specs, body.image, req.params.id
    ]);
    if (hasCompatibility) await saveProductCompatibility(connection, req.params.id, compatibility);
    const [rows] = await connection.query(`
      SELECT p.id, p.title, p.category_id AS category, p.price, p.discount_price AS discountPrice,
             p.sale_price AS salePrice, p.stock, p.sold, p.rating, p.flash_sale AS flashSale, p.specs, p.image,
             pc.cpu_socket AS compatibilityCpuSocket, pc.memory_type AS compatibilityMemoryType,
             pc.motherboard_form_factor AS compatibilityMotherboardFormFactor,
             pc.supported_form_factors AS compatibilitySupportedFormFactors,
             pc.gpu_length_mm AS compatibilityGpuLengthMm,
             pc.max_gpu_length_mm AS compatibilityMaxGpuLengthMm
      FROM products p LEFT JOIN product_compatibility pc ON pc.product_id = p.id
      WHERE p.id = ?`, [req.params.id]);
    await connection.commit();
    res.json(serializeProduct(rows[0]));
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
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
    const [[saleSetting]] = await connection.query(
      "SELECT ends_at_ms AS endsAt FROM flash_sale_settings WHERE id = 1"
    );
    const flashSaleActive = Number(saleSetting?.endsAt || 0) > Date.now();
    const orderItems = [];
    let subtotal = 0;
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!item.productId || !Number.isInteger(quantity) || quantity < 1) {
        throw Object.assign(new Error("Invalid order item."), { status: 400 });
      }
      const [rows] = await connection.query(
        `SELECT id, title, price, discount_price AS discountPrice, sale_price AS salePrice,
                flash_sale AS flashSale, stock
         FROM products WHERE id = ? FOR UPDATE`, [item.productId]
      );
      const product = rows[0];
      if (!product) throw Object.assign(new Error("A product in your cart no longer exists."), { status: 400 });
      if (product.stock < quantity) throw Object.assign(new Error(`${product.title} has insufficient stock.`), { status: 409 });
      const unitPrice = flashSaleActive && product.flashSale && Number(product.salePrice) > 0
        ? Number(product.salePrice)
        : Number(product.discountPrice) || Number(product.price);
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
