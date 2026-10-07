// PCBang Admin Dashboard logic: login, stats, product CRUD, flash sale toggles.
// Auth token is stored in sessionStorage (cleared when the tab/browser closes).

(function () {
  "use strict";

  const state = {
    token: sessionStorage.getItem("pcbang_admin_token") || null,
    categories: [],
    products: [],
    editingId: null,
    deletingId: null
  };

  const money = (n) =>
    "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const el = {
    loginScreen: document.getElementById("loginScreen"),
    adminApp: document.getElementById("adminApp"),
    adminLoginForm: document.getElementById("adminLoginForm"),
    loginError: document.getElementById("loginError"),
    logoutBtn: document.getElementById("logoutBtn"),

    statsGrid: document.getElementById("statsGrid"),
    lowStockBadge: document.getElementById("lowStockBadge"),
    lowStockTable: document.querySelector("#lowStockTable tbody"),

    productsTable: document.querySelector("#productsTable tbody"),
    flashSaleTable: document.querySelector("#flashSaleTable tbody"),
    openAddProductBtn: document.getElementById("openAddProductBtn"),
    categoryFilters: document.querySelectorAll(".category-filter"),

    productModal: document.getElementById("productModal"),
    productModalTitle: document.getElementById("productModalTitle"),
    productForm: document.getElementById("productForm"),
    pfId: document.getElementById("pfId"),
    pfTitle: document.getElementById("pfTitle"),
    pfCategory: document.getElementById("pfCategory"),
    pfStock: document.getElementById("pfStock"),
    pfPrice: document.getElementById("pfPrice"),
    pfDiscountPrice: document.getElementById("pfDiscountPrice"),
    pfImage: document.getElementById("pfImage"),
    pfImageFile: document.getElementById("pfImageFile"),
    pfImageHelp: document.getElementById("pfImageHelp"),
    pfRating: document.getElementById("pfRating"),
    pfSpecs: document.getElementById("pfSpecs"),
    pfFlashSale: document.getElementById("pfFlashSale"),

    deleteModal: document.getElementById("deleteModal"),
    deleteModalDesc: document.getElementById("deleteModalDesc"),
    confirmDeleteBtn: document.getElementById("confirmDeleteBtn"),

    toastContainer: document.getElementById("toastContainer")
  };

  function armLoginFields() {
    ["adminUsername", "adminPassword"].forEach((id) => {
      const input = document.getElementById(id);
      input.value = "";
      input.setAttribute("readonly", "readonly");
      input.addEventListener("focus", () => input.removeAttribute("readonly"), { once: true });
    });
  }

  armLoginFields();

  // API helper
  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        ...(options.headers || {})
      }
    });

    if (res.status === 401) {
      logout();
      throw new Error("Session expired. Please log in again.");
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  // Auth
  function showApp() {
    el.loginScreen.classList.add("hidden");
    el.adminApp.classList.remove("hidden");
    bootstrapDashboard();
    startDashboardRefresh();
  }
  function showLogin() {
    el.adminApp.classList.add("hidden");
    el.loginScreen.classList.remove("hidden");
  }
  function logout() {
    state.token = null;
    sessionStorage.removeItem("pcbang_admin_token");
    el.adminLoginForm.reset();
    armLoginFields();
    showLogin();
  }

  el.adminLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    el.loginError.classList.add("hidden");
    const username = document.getElementById("adminUsername").value;
    const password = document.getElementById("adminPassword").value;

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      state.token = data.token;
      sessionStorage.setItem("pcbang_admin_token", data.token);
      el.adminLoginForm.reset();
      showApp();
    } catch (err) {
      el.loginError.textContent = err.message;
      el.loginError.classList.remove("hidden");
    }
  });

  el.logoutBtn.addEventListener("click", logout);

  // Nav / view switching
  document.querySelectorAll(".admin-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".admin-nav-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".admin-view").forEach((v) => v.classList.add("hidden"));
      document.getElementById(`view-${btn.dataset.view}`).classList.remove("hidden");
    });
  });

  // Bootstrap dashboard data
  async function bootstrapDashboard() {
    try {
      const [categories, products] = await Promise.all([
        fetch("/api/categories").then((r) => r.json()),
        api("/api/admin/products")
      ]);
      state.categories = categories;
      state.products = products;

      populateCategorySelect();
      populateProductCategoryFilter();
      renderStats();
      renderLowStockTable();
      renderProductsTable();
      renderFlashSaleTable();
    } catch (err) {
      showToast(err.message);
    }
  }

  function startDashboardRefresh() {
    if (state.refreshTimer) return;
    state.refreshTimer = setInterval(() => {
      if (!document.hidden && state.token && !el.productModal.classList.contains("open")) bootstrapDashboard();
    }, 5000);
  }

  function populateCategorySelect() {
    const selectedCategory = el.pfCategory.value;
    el.pfCategory.innerHTML = state.categories
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join("");
    if (selectedCategory && state.categories.some((category) => category.id === selectedCategory)) {
      el.pfCategory.value = selectedCategory;
    }
  }

  function populateProductCategoryFilter() {
    const selectedCategory = el.categoryFilters[0].value;
    const options = `<option value="all">All categories</option>` + state.categories
      .map((category) => `<option value="${category.id}">${category.name}</option>`).join("");
    el.categoryFilters.forEach((filter) => {
      filter.innerHTML = options;
      filter.value = selectedCategory;
    });
  }

  function filteredProducts() {
    const category = el.categoryFilters[0].value;
    return category === "all" ? state.products : state.products.filter((product) => product.category === category);
  }

  // Stats
  async function renderStats() {
    let stats;
    try {
      stats = await api("/api/admin/stats");
    } catch (err) {
      showToast(err.message);
      return;
    }

    stats.lowStockAlerts = filteredProducts().filter((product) => product.stock <= 10).length;

    el.statsGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>
          </div>
        </div>
        <div class="stat-value">${stats.totalProducts}</div>
        <div class="stat-label">Total Products</div>
      </div>
      <div class="stat-card green">
        <div class="stat-card-top">
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
        </div>
        <div class="stat-value">${money(stats.totalSales)}</div>
        <div class="stat-label">Total Sales</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-card-top">
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          </div>
        </div>
        <div class="stat-value">${stats.activeCategories}</div>
        <div class="stat-label">Active Categories</div>
      </div>
      <div class="stat-card red">
        <div class="stat-card-top">
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
        </div>
        <div class="stat-value">${stats.lowStockAlerts}</div>
        <div class="stat-label">Low Stock Alerts</div>
      </div>
    `;
  }

  function renderLowStockTable() {
    const lowStock = filteredProducts().filter((p) => p.stock <= 10);
    el.lowStockBadge.textContent = lowStock.length;

    if (lowStock.length === 0) {
      el.lowStockTable.innerHTML = `<tr class="empty-row"><td colspan="4">No low stock items. All good!</td></tr>`;
      return;
    }

    el.lowStockTable.innerHTML = lowStock
      .map(
        (p) => `
      <tr>
        <td>
          <div class="table-product-cell">
            ${adminProductImage(p)}
            <span class="table-product-title">${p.title}</span>
          </div>
        </td>
        <td>${categoryName(p.category)}</td>
        <td>${p.stock}</td>
        <td>${p.stock === 0 ? `<span class="pill red">Out of Stock</span>` : `<span class="pill orange">Low Stock</span>`}</td>
      </tr>`
      )
      .join("");
  }

  function categoryName(id) {
    const c = state.categories.find((c) => c.id === id);
    return c ? c.name : id;
  }

  // Products table
  function renderProductsTable() {
    const products = filteredProducts();
    if (products.length === 0) {
      const hasFilters = el.categoryFilters[0].value !== "all";
      el.productsTable.innerHTML = `<tr class="empty-row"><td colspan="7">${hasFilters ? "No products match the selected filters." : "No products yet. Click \"+ Add Product\" to create one."}</td></tr>`;
      return;
    }

    el.productsTable.innerHTML = products.map((p) => `
      <tr>
        <td><div class="table-product-cell">${adminProductImage(p)}<span class="table-product-title">${p.title}</span></div></td>
        <td><span class="pill blue">${categoryName(p.category)}</span></td>
        <td>${money(p.price)}</td><td>${p.discountPrice ? money(p.discountPrice) : "—"}</td>
        <td>${stockPill(p.stock)}</td><td>${p.flashSale ? `<span class="pill orange">Active</span>` : `<span class="pill gray">Off</span>`}</td>
        <td><div class="table-actions">
          <button class="icon-btn" data-action="edit" data-id="${p.id}" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>
          <button class="icon-btn danger" data-action="delete" data-id="${p.id}" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </div></td>
      </tr>`).join("");

    el.productsTable.querySelectorAll("[data-action='edit']").forEach((b) => b.addEventListener("click", () => openProductModal(b.dataset.id)));
    el.productsTable.querySelectorAll("[data-action='delete']").forEach((b) => b.addEventListener("click", () => openDeleteModal(b.dataset.id)));
  }

  function adminProductImage(product) {
    if (product.image && /^(https?:\/\/|\/)/i.test(product.image)) {
      return `<div class="table-product-icon has-product-image"><img src="${product.image}" alt="${product.title}" onerror="this.parentElement.classList.add('image-load-failed'); this.remove()" /><span class="image-fallback">${pcbIcon(product.category)}</span></div>`;
    }
    return `<div class="table-product-icon"><span class="image-fallback">${pcbIcon(product.category)}</span></div>`;
  }

  function stockPill(stock) {
    if (stock === 0) return `<span class="pill red">0 (Out)</span>`;
    if (stock <= 10) return `<span class="pill orange">${stock}</span>`;
    return `<span class="pill green">${stock}</span>`;
  }

  // Flash sale table
  function renderFlashSaleTable() {
    const products = filteredProducts();
    if (products.length === 0) {
      el.flashSaleTable.innerHTML = `<tr class="empty-row"><td colspan="5">No products available.</td></tr>`;
      return;
    }

    el.flashSaleTable.innerHTML = products
      .map(
        (p) => `
      <tr>
        <td>
          <div class="table-product-cell">
            ${adminProductImage(p)}
            <span class="table-product-title">${p.title}</span>
          </div>
        </td>
        <td>${categoryName(p.category)}</td>
        <td>${money(p.price)}</td>
        <td>${p.discountPrice ? money(p.discountPrice) : "—"}</td>
        <td>
          <label class="switch">
            <input type="checkbox" data-id="${p.id}" ${p.flashSale ? "checked" : ""} />
            <span class="slider"></span>
          </label>
        </td>
      </tr>`
      )
      .join("");

    el.flashSaleTable.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.addEventListener("change", async () => {
        try {
          const updated = await api(`/api/admin/products/${input.dataset.id}`, {
            method: "PUT",
            body: JSON.stringify({ flashSale: input.checked })
          });
          const idx = state.products.findIndex((p) => p.id === updated.id);
          if (idx !== -1) state.products[idx] = updated;
          renderProductsTable();
          renderStats();
          showToast(`Flash Sale ${input.checked ? "enabled" : "disabled"} for "${truncate(updated.title, 30)}".`);
        } catch (err) {
          showToast(err.message);
          input.checked = !input.checked;
        }
      });
    });
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
  }

  // Add / Edit product modal
  el.openAddProductBtn.addEventListener("click", () => openProductModal(null));
  el.categoryFilters.forEach((filter) => {
    filter.addEventListener("change", () => {
      el.categoryFilters.forEach((otherFilter) => { otherFilter.value = filter.value; });
      renderStats();
      renderLowStockTable();
      renderProductsTable();
      renderFlashSaleTable();
    });
  });

  function openProductModal(id) {
    state.editingId = id;
    const product = id ? state.products.find((p) => p.id === id) : null;

    el.productModalTitle.textContent = product ? "Edit Product" : "Add New Product";
    el.pfId.value = product ? product.id : "";
    el.pfTitle.value = product ? product.title : "";
    el.pfCategory.value = product ? product.category : state.categories[0]?.id || "";
    el.pfStock.value = product ? product.stock : "";
    el.pfPrice.value = product ? product.price : "";
    el.pfDiscountPrice.value = product && product.discountPrice ? product.discountPrice : "";
    el.pfImage.value = product ? product.image : state.categories[0]?.icon || "";
    el.pfImageFile.value = "";
    el.pfImageHelp.textContent = product && product.image && /^(https?:\/\/|\/)/i.test(product.image)
      ? `Current image: ${product.image}`
      : "Choose an image from your computer. Existing image stays when no new file is selected.";
    el.pfRating.value = product ? product.rating : 4.5;
    el.pfSpecs.value = product ? product.specs : "";
    el.pfFlashSale.checked = product ? !!product.flashSale : false;

    openModal("productModal");
  }

  el.productForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      title: el.pfTitle.value.trim(),
      category: el.pfCategory.value,
      stock: Number(el.pfStock.value),
      price: Number(el.pfPrice.value),
      discountPrice: el.pfDiscountPrice.value ? Number(el.pfDiscountPrice.value) : null,
      image: el.pfImage.value,
      rating: el.pfRating.value ? Number(el.pfRating.value) : 4.5,
      specs: el.pfSpecs.value.trim(),
      flashSale: el.pfFlashSale.checked
    };

    try {
      if (el.pfImageFile.files[0]) {
        const categoryName = state.categories.find(c => c.id === payload.category)?.name || "Uncategorized";
        const uploadData = new FormData();
        uploadData.append("image", el.pfImageFile.files[0]);
        const uploadResponse = await fetch(`/api/admin/upload-image?category=${encodeURIComponent(categoryName)}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${state.token}` },
          body: uploadData
        });
        const uploadText = await uploadResponse.text();
        let uploadResult;
        try {
          uploadResult = uploadText ? JSON.parse(uploadText) : {};
        } catch (parseError) {
          throw new Error(`Image upload failed (${uploadResponse.status}). Restart the server and try again.`);
        }
        if (!uploadResponse.ok) throw new Error(uploadResult.error || "Image upload failed");
        payload.image = uploadResult.url;
        el.pfImage.value = uploadResult.url;
        el.pfImageHelp.textContent = `New image ready to save: ${uploadResult.url}`;
      }
      let saved;
      if (state.editingId) {
        saved = await api(`/api/admin/products/${state.editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        const idx = state.products.findIndex((p) => p.id === saved.id);
        state.products[idx] = saved;
        showToast(`Updated "${truncate(saved.title, 30)}".`);
      } else {
        saved = await api("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        state.products.push(saved);
        showToast(`Added "${truncate(saved.title, 30)}" to catalog.`);
      }

      closeModal("productModal");
      el.productForm.reset();
      renderStats();
      renderLowStockTable();
      renderProductsTable();
      renderFlashSaleTable();
    } catch (err) {
      showToast(err.message);
    }
  });

  // Delete product
  function openDeleteModal(id) {
    state.deletingId = id;
    const product = state.products.find((p) => p.id === id);
    el.deleteModalDesc.textContent = `Are you sure you want to delete "${product ? product.title : "this product"}"? This action cannot be undone.`;
    openModal("deleteModal");
  }

  el.confirmDeleteBtn.addEventListener("click", async () => {
    if (!state.deletingId) return;
    try {
      await api(`/api/admin/products/${state.deletingId}`, { method: "DELETE" });
      state.products = state.products.filter((p) => p.id !== state.deletingId);
      showToast("Product deleted.");
      closeModal("deleteModal");
      renderStats();
      renderLowStockTable();
      renderProductsTable();
      renderFlashSaleTable();
    } catch (err) { 
      showToast(err.message);
    }
    state.deletingId = null;
  });

  // Modal helpers + toasts
  function openModal(id) {
    document.getElementById(id).classList.add("open");
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove("open");
  }

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", () => backdrop.closest(".modal").classList.remove("open"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal.open").forEach((m) => m.classList.remove("open"));
    }
  });

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>${message}</span>`;
    el.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // Boot
  if (state.token) {
    showApp();
  } else {
    showLogin();
  }
})();
