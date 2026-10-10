// PCBang public storefront logic: data fetching, rendering, cart, wishlist,
// countdown timer, search/filter, and checkout simulation.
// Cart + wishlist state persist in localStorage; accounts and orders use the backend.

(function () {
  "use strict";
 
  // State
  const state = {
    categories: [],
    allProducts: [],
    filteredProducts: [],
    activeCategory: "all",
    searchQuery: "",
    showingWishlist: false,
    cart: loadFromStorage("pcbang_cart", []),
    wishlist: loadFromStorage("pcbang_wishlist", []),
    recentlyViewed: loadFromStorage("pcbang_recently_viewed", []),
    preferredCategories: loadFromStorage("pcbang_category_preferences", []),
    recentSearches: loadFromStorage("pcbang_recent_searches", []),
    currentUser: loadFromStorage("pcbang_user", null),
    authToken: loadFromStorage("pcbang_auth_token", "")
  };

  function loadFromStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* localStorage unavailable — fail silently */
    }
  }

  function authHeaders() {
    return state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {};
  }

  function setCurrentUser(token, user) {
    state.authToken = token;
    state.currentUser = user;
    saveToStorage("pcbang_auth_token", token);
    saveToStorage("pcbang_user", user);
    el.loginBtn.querySelector(".action-label").textContent = user ? user.name : "Login";
  }

  function rememberPreference(category) {
    if (!category) return;
    state.preferredCategories = [category, ...state.preferredCategories.filter((item) => item !== category)].slice(0, 5);
    saveToStorage("pcbang_category_preferences", state.preferredCategories);
  }

  function rememberViewed(product) {
    state.recentlyViewed = [product.id, ...state.recentlyViewed.filter((id) => id !== product.id)].slice(0, 8);
    saveToStorage("pcbang_recently_viewed", state.recentlyViewed);
    rememberPreference(product.category);
  }
  
    function rememberSearch(query) {
      if (!query) return;
      state.recentSearches = [query, ...state.recentSearches.filter((item) => item !== query)].slice(0, 5);
      saveToStorage("pcbang_recent_searches", state.recentSearches);
    }

  const money = (n) =>
    "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // DOM refs
  const el = {
    categoryNavStrip: document.getElementById("categoryNavStrip"),
    categoryGrid: document.getElementById("categoryGrid"),
    flashScroll: document.getElementById("flashScroll"),
    filterPills: document.getElementById("filterPills"),
    productGrid: document.getElementById("productGrid"),
    feedHeading: document.getElementById("feedHeading"),
    feedSubtitle: document.getElementById("feedSubtitle"),
    searchForm: document.getElementById("searchForm"),
    searchInput: document.getElementById("searchInput"),
    cartBtn: document.getElementById("cartBtn"),
    cartCount: document.getElementById("cartCount"),
    wishlistBtn: document.getElementById("wishlistBtn"),
    wishlistCount: document.getElementById("wishlistCount"),
    cartPanel: document.getElementById("cartPanel"),
    overlay: document.getElementById("overlay"),
    closeCartBtn: document.getElementById("closeCartBtn"),
    cartItems: document.getElementById("cartItems"),
    cartFooter: document.getElementById("cartFooter"),
    cartSubtotal: document.getElementById("cartSubtotal"),
    cartTotal: document.getElementById("cartTotal"),
    checkoutBtn: document.getElementById("checkoutBtn"),
    checkoutModal: document.getElementById("checkoutModal"),
    checkoutSummary: document.getElementById("checkoutSummary"),
    checkoutForm: document.getElementById("checkoutForm"),
    successModal: document.getElementById("successModal"),
    successMessage: document.getElementById("successMessage"),
    loginModal: document.getElementById("loginModal"),
    accountModal: document.getElementById("accountModal"),
    accountContent: document.getElementById("accountContent"),
    productDetailsModal: document.getElementById("productDetailsModal"),
    productDetailsContent: document.getElementById("productDetailsContent"),
    loginBtn: document.getElementById("loginBtn"),
    loginForm: document.getElementById("loginForm"),
    signupForm: document.getElementById("signupForm"),
    authSwitchBtn: document.getElementById("authSwitchBtn"),
    supportBtn: document.getElementById("supportBtn"),
    toastContainer: document.getElementById("toastContainer")
  };

  
  // Init
  async function init() {
    startCountdown();
    bindGlobalEvents();
    updateCartBadge();
    updateWishlistBadge();

    try {
      const [catRes, prodRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/products")
      ]);
      state.categories = await catRes.json();
      state.allProducts = await prodRes.json();
      syncWishlistWithProducts();

      renderCategoryNav();
      renderCategoryGrid();
      renderFlashSale();
      renderFilterPills();
      applyFilters();
      startProductRefresh();
    } catch (err) {
      console.error("Failed to load storefront data:", err);
      el.productGrid.innerHTML = `<div class="empty-state">Couldn't load products. Please make sure the server is running.</div>`;
    }
  }

  function startProductRefresh() {
    setInterval(async () => {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        if (!response.ok) return;
        state.allProducts = await response.json();
        syncWishlistWithProducts();
        applyFilters();
        renderFlashSale();
      } catch (err) {
        console.warn("Live product refresh failed:", err.message);
      }
    }, 5000);
  }

  // Countdown timer (resets to a fresh 6-hour window when it hits zero)
  function startCountdown() {
    const DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours
    let endTime = Number(sessionStorage.getItem("pcbang_flash_end"));
    if (!endTime || endTime < Date.now()) {
      endTime = Date.now() + DURATION_MS;
      sessionStorage.setItem("pcbang_flash_end", String(endTime));
    }

    function tick() {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        endTime = Date.now() + DURATION_MS;
        sessionStorage.setItem("pcbang_flash_end", String(endTime));
      }
      const total = Math.max(0, endTime - Date.now());
      const hours = Math.floor(total / (1000 * 60 * 60));
      const minutes = Math.floor((total / (1000 * 60)) % 60);
      const seconds = Math.floor((total / 1000) % 60);
      document.getElementById("cd-hours").textContent = String(hours).padStart(2, "0");
      document.getElementById("cd-minutes").textContent = String(minutes).padStart(2, "0");
      document.getElementById("cd-seconds").textContent = String(seconds).padStart(2, "0");
    }

    tick();
    setInterval(tick, 1000);
  }

  // Rendering: category nav strip (under header)
  function renderCategoryNav() {
    el.categoryNavStrip.innerHTML = state.categories
      .map((c) => `<a href="#" data-cat="${c.id}">${c.name}</a>`)
      .join("");

    el.categoryNavStrip.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        setActiveCategory(a.dataset.cat);
        document.getElementById("justForYou").scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  // Rendering: category grid (icon tiles)
  function renderCategoryGrid() {
    el.categoryGrid.innerHTML = state.categories
      .map(
        (c) => `
      <button class="category-tile" data-cat="${c.id}">
        <span class="cat-icon-circle">${pcbIcon(c.icon)}</span>
        <span>${c.name}</span>
      </button>`
      )
      .join("");

    el.categoryGrid.querySelectorAll(".category-tile").forEach((btn) => {
      btn.addEventListener("click", () => {
        setActiveCategory(btn.dataset.cat);
        document.getElementById("justForYou").scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  // Rendering: flash sale horizontal scroll feed
  function renderFlashSale() {
    const flashItems = state.allProducts.filter((p) => p.flashSale);
    if (flashItems.length === 0) {
      el.flashScroll.innerHTML = `<div class="empty-state" style="color:#fff;background:transparent;">No flash sale items right now. Check back soon!</div>`;
      return;
    }

    el.flashScroll.innerHTML = flashItems.map(flashCardTemplate).join("");

    el.flashScroll.querySelectorAll(".flash-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        openProductDetails(id);
      });
    });
  }

  function flashCardTemplate(p) {
    const discountPct = p.discountPrice
      ? Math.round(100 - (p.discountPrice / p.price) * 100)
      : 0;
    const stockPct = Math.min(100, Math.max(6, 100 - p.stock * 2));
    return `
      <div class="flash-card" data-id="${p.id}">
        <div class="flash-card-img-wrap">
          <span class="discount-badge">-${discountPct}%</span>
          ${productImageMarkup(p)}
        </div>
        <div class="flash-card-body">
          <div class="flash-card-title">${p.title}</div>
          <div class="flash-card-prices">
            <span class="price-now">${money(p.discountPrice)}</span>
            <span class="price-was">${money(p.price)}</span>
          </div>
          <div class="stock-bar-wrap">
            <div class="stock-bar-fill" style="width:${stockPct}%"></div>
            <div class="stock-bar-text">${p.stock <= 5 ? "Almost gone!" : p.stock + " left"}</div>
          </div>
        </div>
      </div>`;
  }

  // Rendering: filter pills + product grid ("Just For You")
  function renderFilterPills() {
    const pills = [{ id: "all", name: "All" }, ...state.categories];
    el.filterPills.innerHTML = pills
      .map(
        (c) =>
          `<button class="filter-pill ${c.id === state.activeCategory ? "active" : ""}" data-cat="${c.id}">${c.name}</button>`
      )
      .join("");

    el.filterPills.querySelectorAll(".filter-pill").forEach((btn) => {
      btn.addEventListener("click", () => setActiveCategory(btn.dataset.cat));
    });
  }

  function setActiveCategory(catId) {
    state.showingWishlist = false;
    state.activeCategory = catId;
    state.searchQuery = "";
      rememberPreference(catId === "all" ? null : catId);
    el.searchInput.value = "";
    applyFilters();
    renderFilterPills();
  }

  function applyFilters() {
    if (state.showingWishlist) {
      state.filteredProducts = state.allProducts.filter((p) => state.wishlist.includes(p.id));
      el.feedHeading.textContent = "My Wishlist";
      el.feedSubtitle.textContent = `${state.filteredProducts.length} saved item(s)`;
      renderProductGrid();
      return;
    }

    let list;
    if (state.activeCategory !== "all") {
      list = state.allProducts.filter((p) => p.category === state.activeCategory);
    } else if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = state.allProducts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.specs && p.specs.toLowerCase().includes(q))
      );
    } else {
      list = personalizedProducts();
    }
    state.filteredProducts = list;

    if (state.searchQuery) {
      el.feedHeading.textContent = `Search results for "${state.searchQuery}"`;
      el.feedSubtitle.textContent = `${list.length} item(s) found`;
    } else {
      el.feedHeading.textContent = "Just For You";
      el.feedSubtitle.textContent = "Based on your recent views, cart, searches, and category preferences";
    }

    renderProductGrid();
  }

  function personalizedProducts() {
    const cartIds = new Set(state.cart.map((item) => item.id));
    const viewedIds = new Map(state.recentlyViewed.map((id, index) => [id, state.recentlyViewed.length - index]));
    const preferred = new Map(state.preferredCategories.map((category, index) => [category, state.preferredCategories.length - index]));
      const searchMatches = new Set(
        state.allProducts
          .filter((product) => state.recentSearches.some((query) => {
            const normalizedQuery = query.toLowerCase();
            return product.title.toLowerCase().includes(normalizedQuery) ||
              product.category.toLowerCase().includes(normalizedQuery) ||
              (product.specs && product.specs.toLowerCase().includes(normalizedQuery));
          }))
          .map((product) => product.id)
      );

    return state.allProducts
      .map((product) => ({
        product,
        score: (cartIds.has(product.id) ? 100 : 0) +
          (viewedIds.get(product.id) || 0) * 10 +
          (preferred.get(product.category) || 0) * 5 +
          (searchMatches.has(product.id) ? 50 : 0) +
          (product.flashSale ? 1 : 0)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 13)
      .map((entry) => entry.product);
  }

  function renderProductGrid() {
    const list = state.filteredProducts;
    if (list.length === 0) {
      const emptyMessage = state.showingWishlist
        ? "Your wishlist is empty. Tap a heart on a product to save it here."
        : "No products found. Try a different search or category.";
      el.productGrid.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p>${emptyMessage}</p>
        </div>`;
      return;
    }

    el.productGrid.innerHTML = list.map(productCardTemplate).join("");

    el.productGrid.querySelectorAll(".add-to-cart-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        addToCart(btn.dataset.id);
      });
    });
    el.productGrid.querySelectorAll(".product-card").forEach((card) => {
      card.addEventListener("click", () => openProductDetails(card.dataset.id));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openProductDetails(card.dataset.id);
        }
      });
    });
    el.productGrid.querySelectorAll(".wishlist-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleWishlist(btn.dataset.id);
      });
    });
  }

  function productCardTemplate(p) {
    const hasDiscount = !!p.discountPrice;
    const discountPct = hasDiscount ? Math.round(100 - (p.discountPrice / p.price) * 100) : 0;
    const inWishlist = state.wishlist.includes(p.id);
    const stockLabel =
      p.stock === 0
        ? `<span class="stock-tag out-stock">Out of Stock</span>`
        : p.stock <= 10
        ? `<span class="stock-tag low-stock">Only ${p.stock} left</span>`
        : `<span class="stock-tag in-stock">In Stock</span>`;

    return `
      <article class="product-card" data-id="${p.id}" tabindex="0" role="button" aria-label="View ${p.title}">
        <div class="product-img-wrap">
          ${hasDiscount ? `<span class="discount-badge">-${discountPct}%</span>` : ""}
          <button class="wishlist-btn ${inWishlist ? "active" : ""}" data-id="${p.id}" aria-label="Toggle wishlist">
            <svg viewBox="0 0 24 24" fill="${inWishlist ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z"/></svg>
          </button>
          ${productImageMarkup(p)}
        </div>
        <div class="product-body">
          <div class="product-title">${p.title}</div>
          <div class="product-prices">
            <span class="product-price-now ${hasDiscount ? "on-sale" : ""}">${money(p.discountPrice || p.price)}</span>
            ${hasDiscount ? `<span class="product-price-was">${money(p.price)}</span>` : ""}
          </div>
          <div class="product-meta">
            <span class="rating-row">
              <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/></svg>
              ${p.rating.toFixed(1)} <span>| ${p.sold} sold</span>
            </span>
          </div>
          ${stockLabel}
          <button class="add-to-cart-btn" data-id="${p.id}" ${p.stock === 0 ? "disabled" : ""}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
            ${p.stock === 0 ? "Out of Stock" : "Add to Cart"}
          </button>
        </div>
      </article>`;
  }

  function productImageMarkup(product) {
    if (product.image && /^(https?:\/\/|\/)/i.test(product.image)) {
      return `<div class="product-image-frame has-product-image"><img class="product-photo" src="${product.image}" alt="${product.title}" onerror="this.parentElement.classList.add('image-load-failed'); this.remove()" /><div class="pc-icon-wrap image-fallback" style="color:var(--pcb-blue)">${pcbIcon(product.category)}</div></div>`;
    }
    return `<div class="product-image-frame"><div class="pc-icon-wrap image-fallback" style="color:var(--pcb-blue)">${pcbIcon(product.category)}</div></div>`;
  }

  function openProductDetails(productId) {
    const product = state.allProducts.find((p) => p.id === productId);
    if (!product) return;
    rememberViewed(product);
    const category = state.categories.find((c) => c.id === product.category);
    const related = state.allProducts.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);
    el.productDetailsContent.innerHTML = `
      <div class="storefront-detail-main">
        <div class="storefront-detail-image">${productImageMarkup(product)}</div>
        <div class="storefront-detail-copy">
          <span class="detail-category">${category ? category.name : product.category}</span>
          <h3>${product.title}</h3>
          ${product.flashSale ? `<span class="detail-sale-label">Flash Sale</span>` : ""}
          <div class="detail-rating">★ ${product.rating.toFixed(1)} <span>(${product.sold} sold)</span></div>
          <div class="detail-price">${money(product.discountPrice || product.price)} ${product.discountPrice ? `<s>${money(product.price)}</s>` : ""}</div>
          <p class="detail-stock">${product.stock > 0 ? `${product.stock} units available` : "Out of stock"}</p>
          <div class="detail-purchase-row">
            <span class="detail-quantity-label">Quantity</span>
            <div class="qty-control detail-qty-control">
              <button type="button" data-detail-qty="decrease" aria-label="Decrease quantity">-</button>
              <input id="detailQuantity" class="qty-input" type="number" min="1" max="${Math.max(1, product.stock)}" value="1" aria-label="Quantity for ${product.title}">
              <button type="button" data-detail-qty="increase" aria-label="Increase quantity">+</button>
            </div>
            <button class="btn-primary detail-cart-btn" data-id="${product.id}" ${product.stock === 0 ? "disabled" : ""}>${product.stock === 0 ? "Out of Stock" : "Add to Cart"}</button>
          </div>
        </div>
      </div>
      <div class="detail-section"><h4>Specifications</h4><p>${product.specs || "No specifications available yet."}</p></div>
      <div class="detail-info-grid">
        <div class="detail-section"><h4>Customer reviews</h4><p class="detail-stars">★★★★★</p><p>${product.rating.toFixed(1)} out of 5 from the catalog rating.</p><small>Written reviews will appear here when customer review storage is added.</small></div>
        <div class="detail-section"><h4>Payment methods</h4><div class="detail-payment-list"><span>Cash on Delivery</span><span>GCash / Maya</span><span>Card</span><span>Bank Transfer</span></div></div>
      </div>
      <div class="detail-related"><div class="detail-related-heading"><h4>Related products</h4><span>${category ? category.name : "More like this"}</span></div><div class="related-product-grid">${related.length ? related.map(relatedProductTemplate).join("") : "<p>No related products yet.</p>"}</div></div>`;
    el.productDetailsContent.querySelector(".detail-cart-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      addToCart(product.id, Number(el.productDetailsContent.querySelector("#detailQuantity").value));
    });
    el.productDetailsContent.querySelectorAll("[data-detail-qty]").forEach((button) => {
      button.addEventListener("click", () => {
        const quantity = el.productDetailsContent.querySelector("#detailQuantity");
        const current = Number(quantity.value);
        const next = button.dataset.detailQty === "increase" ? current + 1 : current - 1;
        quantity.value = Math.min(Math.max(1, next), Math.max(1, product.stock));
      });
    });
    el.productDetailsContent.querySelector("#detailQuantity")?.addEventListener("change", (event) => {
      event.target.value = clampQuantity(event.target.value, product.stock);
    });
    el.productDetailsContent.querySelectorAll(".related-product-card").forEach((card) => {
      card.addEventListener("click", () => openProductDetails(card.dataset.id));
    });
    openModal("productDetailsModal");
  }

  function relatedProductTemplate(product) {
    return `<button class="related-product-card" data-id="${product.id}"><div class="related-product-image">${productImageMarkup(product)}</div><strong>${truncate(product.title, 42)}</strong><span>${money(product.discountPrice || product.price)}</span></button>`;
  }

  // Cart logic
  function addToCart(productId, quantity = 1) {
    const product = state.allProducts.find((p) => p.id === productId);
    if (!product || product.stock === 0) return;
    rememberPreference(product.category);
    const requestedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));

    const existing = state.cart.find((item) => item.id === productId);
    if (existing) {
      if (existing.qty + requestedQuantity <= product.stock) {
        existing.qty += requestedQuantity;
      } else {
        showToast(`Only ${product.stock} in stock.`);
        return;
      }
    } else {
      if (requestedQuantity > product.stock) {
        showToast(`Only ${product.stock} in stock.`);
        return;
      }
      state.cart.push({ id: productId, qty: requestedQuantity });
    }

    saveToStorage("pcbang_cart", state.cart);
    updateCartBadge();
    renderCartPanel();
    showToast(`Added "${truncate(product.title, 40)}" to cart.`);
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
  }

  function changeQty(productId, delta) {
    const item = state.cart.find((i) => i.id === productId);
    if (!item) return;
    const product = state.allProducts.find((p) => p.id === productId);
    const newQty = item.qty + delta;

    if (newQty <= 0) {
      state.cart = state.cart.filter((i) => i.id !== productId);
    } else if (product && newQty > product.stock) {
      showToast(`Only ${product.stock} in stock.`);
      return;
    } else {
      item.qty = newQty;
    }

    saveToStorage("pcbang_cart", state.cart);
    updateCartBadge();
    renderCartPanel();
  }

  function setQty(productId, value) {
    const item = state.cart.find((i) => i.id === productId);
    const product = state.allProducts.find((p) => p.id === productId);
    if (!item || !product) return;
    const quantity = clampQuantity(value, product.stock);
    if (quantity !== Number(value)) showToast(`Only ${product.stock} in stock.`);
    item.qty = quantity;
    saveToStorage("pcbang_cart", state.cart);
    updateCartBadge();
    renderCartPanel();
  }

  function clampQuantity(value, stock) {
    return Math.min(Math.max(1, Math.floor(Number(value) || 1)), Math.max(1, stock));
  }

  function removeFromCart(productId) {
    state.cart = state.cart.filter((i) => i.id !== productId);
    saveToStorage("pcbang_cart", state.cart);
    updateCartBadge();
    renderCartPanel();
  }

  function cartWithDetails() {
    return state.cart
      .map((item) => {
        const product = state.allProducts.find((p) => p.id === item.id);
        if (!product) return null;
        const unitPrice = product.discountPrice || product.price;
        return { ...item, product, unitPrice, lineTotal: unitPrice * item.qty };
      })
      .filter(Boolean);
  }

  function cartTotals() {
    const items = cartWithDetails();
    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    return { items, subtotal, total: subtotal };
  }

  function updateCartBadge() {
    const count = state.cart.reduce((sum, i) => sum + i.qty, 0);
    el.cartCount.textContent = count;
    el.cartCount.classList.toggle("hidden", count === 0);
  }

  function updateWishlistBadge() {
    el.wishlistCount.textContent = state.wishlist.length;
    el.wishlistCount.classList.toggle("hidden", state.wishlist.length === 0);
  }

  function syncWishlistWithProducts() {
    const availableProductIds = new Set(state.allProducts.map((product) => product.id));
    const validWishlist = [...new Set(state.wishlist.filter((id) => availableProductIds.has(id)))];
    const changed = validWishlist.length !== state.wishlist.length ||
      validWishlist.some((id, index) => id !== state.wishlist[index]);

    if (changed) {
      state.wishlist = validWishlist;
      saveToStorage("pcbang_wishlist", state.wishlist);
    }
    updateWishlistBadge();
  }

  function toggleWishlist(productId) {
    const idx = state.wishlist.indexOf(productId);
    if (idx === -1) {
      state.wishlist.push(productId);
      showToast("Added to wishlist.");
    } else {
      state.wishlist.splice(idx, 1);
      showToast("Removed from wishlist.");
    }
    saveToStorage("pcbang_wishlist", state.wishlist);
    updateWishlistBadge();
    applyFilters();
  }

  function renderCartPanel() {
    const { items, subtotal, total } = cartTotals();

    if (items.length === 0) {
      el.cartItems.innerHTML = `
        <div class="cart-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
          <p>Your cart is empty.<br/>Start adding some PC parts!</p>
        </div>`;
      el.checkoutBtn.disabled = true;
    } else {
      el.cartItems.innerHTML = items
        .map(
          (i) => `
        <div class="cart-item" data-id="${i.id}">
          <div class="cart-item-img">${productImageMarkup(i.product)}</div>
          <div class="cart-item-info">
            <div class="cart-item-title">${i.product.title}</div>
            <div class="cart-item-price">${money(i.unitPrice)}</div>
            <div class="cart-item-controls">
              <div class="qty-control">
                <button data-action="dec" data-id="${i.id}">−</button>
                <input class="qty-input" type="number" min="1" max="${i.product.stock}" value="${i.qty}" aria-label="Quantity for ${i.product.title}" data-action="qty" data-id="${i.id}">
                <button data-action="inc" data-id="${i.id}">+</button>
              </div>
              <button class="remove-item-btn" data-action="remove" data-id="${i.id}">Remove</button>
            </div>
          </div>
        </div>`
        )
        .join("");
      el.checkoutBtn.disabled = false;
    }

    el.cartSubtotal.textContent = money(subtotal);
    el.cartTotal.textContent = money(total);

    el.cartItems.querySelectorAll("[data-action='inc']").forEach((b) =>
      b.addEventListener("click", () => changeQty(b.dataset.id, 1))
    );
    el.cartItems.querySelectorAll("[data-action='dec']").forEach((b) =>
      b.addEventListener("click", () => changeQty(b.dataset.id, -1))
    );
    el.cartItems.querySelectorAll("[data-action='qty']").forEach((input) =>
      input.addEventListener("change", () => setQty(input.dataset.id, input.value))
    );
    el.cartItems.querySelectorAll("[data-action='remove']").forEach((b) =>
      b.addEventListener("click", () => removeFromCart(b.dataset.id))
    );
  }

  // Cart panel open/close
  function openCart() {
    renderCartPanel();
    el.cartPanel.classList.add("open");
    el.overlay.classList.add("open");
  }
  function closeCart() {
    el.cartPanel.classList.remove("open");
    el.overlay.classList.remove("open");
  }

  // Checkout flow
  function openCheckout() {
    const { items, total } = cartTotals();
    if (items.length === 0) return;

    if (state.currentUser) {
      document.getElementById("ckName").value = state.currentUser.name || "";
      document.getElementById("ckAddress").value = state.currentUser.address || "";
      document.getElementById("ckPhone").value = state.currentUser.phone || "";
    } else {
      document.getElementById("ckName").value = "";
      document.getElementById("ckAddress").value = "";
      document.getElementById("ckPhone").value = "";
    }

    el.checkoutSummary.innerHTML = `
      ${items
        .map(
          (i) => `<div class="row"><span>${truncate(i.product.title, 34)} × ${i.qty}</span><span>${money(i.lineTotal)}</span></div>`
        )
        .join("")}
      <div class="row total"><span>Total</span><span>${money(total)}</span></div>
    `;
    openModal("checkoutModal");
  }

  async function handleCheckoutSubmit(e) {
    e.preventDefault();
    const submitButton = el.checkoutForm.querySelector("button[type='submit']");
    const name = document.getElementById("ckName").value;
    const { items } = cartTotals();
    submitButton.disabled = true;
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          customerName: name,
          deliveryAddress: document.getElementById("ckAddress").value,
          phone: document.getElementById("ckPhone").value,
          paymentMethod: document.getElementById("ckPayment").value,
          items: items.map((item) => ({ productId: item.id, quantity: item.qty }))
        })
      });
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Server returned an invalid response (${response.status}). Make sure the app is running at http://localhost:3000.`);
      }
      if (!response.ok) throw new Error(data.error || "Unable to place order.");

      state.cart = [];
      saveToStorage("pcbang_cart", state.cart);
      updateCartBadge();
      renderCartPanel();
      closeModal("checkoutModal");
      closeCart();
      el.checkoutForm.reset();
      el.successMessage.textContent = `Thanks, ${name}! Order #${data.orderId} totaling ${money(data.total)} has been placed.`;
      openModal("successModal");
      const products = await fetch("/api/products").then((res) => res.json());
      state.allProducts = products;
      applyFilters();
      renderFlashSale();
    } catch (err) {
      showToast(err.message);
    } finally {
      submitButton.disabled = false;
    }
  }

  // Generic modal helpers
  function openModal(id) {
    document.getElementById(id).classList.add("open");
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove("open");
  }

  // Toasts
  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <span>${message}</span>`;
    el.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // Global event bindings
  function bindGlobalEvents() {
    window.addEventListener("scroll", () => {
      document.querySelector(".site-header").classList.toggle("scrolled", window.scrollY > 24);
    }, { passive: true });

    el.searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      state.showingWishlist = false;
      state.searchQuery = el.searchInput.value.trim();
      rememberSearch(state.searchQuery);
      state.activeCategory = "all";
      applyFilters();
      renderFilterPills();
      document.getElementById("justForYou").scrollIntoView({ behavior: "smooth" });
    });
    el.searchInput.addEventListener("input", () => {
      if (!el.searchInput.value.trim() && state.searchQuery) {
        state.showingWishlist = false;
        state.searchQuery = "";
        state.activeCategory = "all";
        applyFilters();
        renderFilterPills();
      }
    });

    el.cartBtn.addEventListener("click", openCart);
    el.closeCartBtn.addEventListener("click", closeCart);
    el.overlay.addEventListener("click", () => {
      closeCart();
      closeAllModals();
    });

    el.checkoutBtn.addEventListener("click", openCheckout);
    el.checkoutForm.addEventListener("submit", handleCheckoutSubmit);

    el.wishlistBtn.addEventListener("click", () => {
      state.showingWishlist = true;
      state.activeCategory = "all";
      state.searchQuery = "";
      state.filteredProducts = state.allProducts.filter((p) => state.wishlist.includes(p.id));
      el.feedHeading.textContent = "My Wishlist";
      el.feedSubtitle.textContent = `${state.filteredProducts.length} saved item(s)`;
      renderProductGrid();
      document.getElementById("justForYou").scrollIntoView({ behavior: "smooth" });
    });

    el.loginBtn.addEventListener("click", () => {
      if (state.currentUser) {
        openAccount();
        return;
      }
      showLoginForm();
      openModal("loginModal");
    });
    el.loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail").value.trim().toLowerCase();
      const password = document.getElementById("loginPassword").value;
      submitAuth("/api/auth/login", { email, password }, "Welcome back!");
    });
    el.signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitButton = el.signupForm.querySelector("button[type='submit']");
      const name = document.getElementById("signupName").value.trim();
      const email = document.getElementById("signupEmail").value.trim().toLowerCase();
      const password = document.getElementById("signupPassword").value;
      submitButton.disabled = true;
      try {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name, email, password,
            age: Number(document.getElementById("signupAge").value),
            address: document.getElementById("signupAddress").value.trim(),
            phone: document.getElementById("signupPhone").value.trim()
          })
        });
        const data = await response.json();
        if (!response.ok) {
          showToast(data.error || "Unable to create account.");
          return;
        }
        resetAuthModal();
        closeModal("loginModal");
        showToast("Account created successfully. You can now log in.");
      } catch (error) {
        showToast("Unable to reach the server. Please restart the PCBang server and try again.");
      } finally {
        submitButton.disabled = false;
      }
    });
    el.authSwitchBtn.addEventListener("click", () => {
      const showingLogin = !el.loginForm.classList.contains("hidden");
      el.loginForm.classList.toggle("hidden", showingLogin);
      el.signupForm.classList.toggle("hidden", !showingLogin);
      el.authSwitchBtn.textContent = showingLogin ? "Back to log in" : "Create an account";
    });

    el.supportBtn.addEventListener("click", () => {
      showToast("Customer support: support@pcbang.ph | (02) 8123-4567");
    });

    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const modalId = btn.dataset.closeModal;
        if (modalId === "loginModal") resetAuthModal();
        closeModal(modalId);
      });
    });
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", () => {
        const modal = backdrop.closest(".modal");
        if (modal.id === "loginModal") resetAuthModal();
        modal.classList.remove("open");
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeCart();
        resetAuthModal();
        closeAllModals();
      }
    });
  }

  function closeAllModals() {
    document.querySelectorAll(".modal.open").forEach((m) => m.classList.remove("open"));
  }

  function showLoginForm() {
    el.loginForm.classList.remove("hidden");
    el.signupForm.classList.add("hidden");
    el.authSwitchBtn.textContent = "Create an account";
  }

  function resetAuthModal() {
    el.loginForm.reset();
    el.signupForm.reset();
    showLoginForm();
  }

  async function submitAuth(url, body, message) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || "Authentication failed.");
        return;
      }
      setCurrentUser(data.token, data.user);
      closeModal("loginModal");
      el.loginForm.reset();
      showToast(message);
    } catch (error) {
      console.error("Authentication request failed:", error);
      showToast("Unable to reach the server. Please try again.");
    }
  }

  async function openAccount() {
    openModal("accountModal");
    el.accountContent.innerHTML = "<p class=\"modal-desc\">Loading your account...</p>";
    try {
      const response = await fetch("/api/account", { headers: authHeaders() });
      if (response.status === 401) {
        setCurrentUser("", null);
        closeModal("accountModal");
        showToast("Your session expired. Please log in again.");
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load your account.");

      setCurrentUser(state.authToken, data.user);
      const orders = data.orders || [];
      el.accountContent.innerHTML = `
        <div class="account-details"><p><strong>${data.user.name}</strong><br>${data.user.email}</p><p>Age: ${data.user.age}<br>Phone: ${data.user.phone}<br>Address: ${data.user.address}</p></div>
        <div class="account-section-heading"><h4>Order Items</h4><span>${orders.length} order${orders.length === 1 ? "" : "s"}</span></div>
        ${orders.length ? orders.map(accountOrderTemplate).join("") : "<p class=\"modal-desc\">No orders yet.</p>"}
        <button type="button" class="auth-switch-btn" id="logoutBtn">Log out</button>`;
      document.getElementById("logoutBtn").addEventListener("click", async () => {
        try {
          const logoutResponse = await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() });
          if (!logoutResponse.ok) throw new Error("Unable to log out. Please try again.");
          setCurrentUser("", null);
          closeModal("accountModal");
          showToast("You have been logged out.");
        } catch (error) {
          console.error("Logout request failed:", error);
          showToast(error.message || "Unable to reach the server. Please try again.");
        }
      });
    } catch (error) {
      console.error("Account request failed:", error);
      el.accountContent.innerHTML = "<p class=\"modal-desc\">Unable to load your account. Please try again.</p>";
      showToast(error.message || "Unable to reach the server. Please try again.");
    }
  }

  function accountOrderTemplate(order) {
    const items = order.items || [];
    return `<details class="account-order">
      <summary class="account-order-header"><div><strong>Order #${order.id}</strong><span>${new Date(order.createdAt).toLocaleDateString()}</span></div><span class="account-order-meta"><span class="order-status">${order.status}</span><span class="account-order-toggle" aria-hidden="true"></span></span></summary>
      <div class="account-order-items">${items.map((item) => { const quantity = Number(item.quantity) || 1; const unitPrice = Number(item.unitPrice) || (Number(item.lineTotal) / quantity); return `<div class="account-order-item"><div class="account-order-image">${productImageMarkup({ id: item.productId, title: item.productTitle, category: item.category || "", image: item.image })}</div><div class="account-order-item-info"><strong>${item.productTitle}</strong><span>${money(unitPrice)} each · Qty ${quantity}</span></div><strong>${money(item.lineTotal || unitPrice * quantity)}</strong></div>`; }).join("")}</div>
      <div class="account-order-summary"><span>Total <strong>${money(order.total)}</strong></span></div>
    </details>`;
  }

  init();
})();
