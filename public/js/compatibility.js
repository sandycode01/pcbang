(function () {
  "use strict";

  const selects = {
    cpuId: document.getElementById("builderCpu"),
    motherboardId: document.getElementById("builderMotherboard"),
    ramId: document.getElementById("builderRam"),
    gpuId: document.getElementById("builderGpu"),
    caseId: document.getElementById("builderCase")
  };
  const results = document.getElementById("pcBuilderResults");
  const addToCartButton = document.getElementById("addPcBuildToCart");
  const resetButton = document.getElementById("resetPcBuilder");
  const nav = document.getElementById("categoryNavStrip");
  const cartButton = document.getElementById("cartBtn");
  const cartCount = document.getElementById("cartCount");
  const cartPanel = document.getElementById("cartPanel");
  const overlay = document.getElementById("overlay");
  const cartItems = document.getElementById("cartItems");
  const cartSubtotal = document.getElementById("cartSubtotal");
  const cartTotal = document.getElementById("cartTotal");
  const checkoutButton = document.getElementById("checkoutBtn");
  let cart = readStorage("pcbang_cart", []);
  if (!Array.isArray(cart)) cart = [];
  let authToken = readStorage("pcbang_auth_token", "");
  let wishlist = readStorage("pcbang_wishlist", []);
  if (!Array.isArray(wishlist)) wishlist = [];
  let savedItemsSaveQueue = Promise.resolve();
  let requestVersion = 0;
  let productsById = new Map();
  let cartProductsById = new Map();

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function authHeaders() {
    return typeof authToken === "string" && authToken
      ? { Authorization: `Bearer ${authToken}` }
      : {};
  }

  function updateCartBadge() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    cartCount.textContent = String(count);
    cartCount.classList.toggle("hidden", count === 0);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function persistCart() {
    try {
      localStorage.setItem("pcbang_cart", JSON.stringify(cart));
    } catch (error) {
      throw new Error("Your cart could not be saved in this browser. Check available browser storage and try again.");
    }
    if (!authToken) return Promise.resolve();

    const snapshot = {
      cart: cart.map((item) => ({ id: item.id, qty: item.qty })),
      wishlist: [...wishlist]
    };
    savedItemsSaveQueue = savedItemsSaveQueue.catch(() => {}).then(async () => {
      const response = await fetch("/api/account/saved-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(snapshot)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save your account cart.");
    });
    return savedItemsSaveQueue;
  }

  async function restoreAccountCart() {
    if (!authToken) return;
    const response = await fetch("/api/account/saved-items", { headers: authHeaders() });
    const data = await response.json();
    if (response.status === 401) {
      authToken = "";
      localStorage.removeItem("pcbang_auth_token");
      return;
    }
    if (!response.ok) throw new Error(data.error || "Unable to load your account cart.");

    const mergedCart = new Map();
    for (const item of [...(Array.isArray(data.cart) ? data.cart : []), ...cart]) {
      const product = cartProductsById.get(item.id);
      const quantity = Number(item.qty);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || product.stock <= 0) continue;
      mergedCart.set(item.id, Math.min(Math.max(mergedCart.get(item.id) || 0, quantity), product.stock));
    }
    cart = [...mergedCart].map(([id, qty]) => ({ id, qty }));
    wishlist = [...new Set([
      ...(Array.isArray(data.wishlist) ? data.wishlist : []),
      ...(Array.isArray(wishlist) ? wishlist : [])
    ].filter((id) => cartProductsById.has(id)))];
    updateCartBadge();
    renderCartPanel();
    await persistCart();
  }

  function openCart() {
    renderCartPanel();
    cartPanel.classList.add("open");
    cartPanel.setAttribute("aria-hidden", "false");
    overlay.classList.add("open");
    cartButton.setAttribute("aria-expanded", "true");
    document.getElementById("closeCartBtn").focus();
  }

  function closeCart() {
    cartPanel.classList.remove("open");
    cartPanel.setAttribute("aria-hidden", "true");
    overlay.classList.remove("open");
    cartButton.setAttribute("aria-expanded", "false");
    cartButton.focus({ preventScroll: true });
  }

  function renderCartPanel() {
    const items = cart.map((item) => {
      const product = cartProductsById.get(item.id);
      if (!product) return null;
      const price = effectivePrice(product);
      return { ...item, product, price, lineTotal: price * item.qty };
    }).filter(Boolean);
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    if (!items.length) {
      cartItems.innerHTML = `<div class="cart-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg><p>Your cart is empty.<br/>Start adding some PC parts!</p></div>`;
      checkoutButton.disabled = true;
    } else {
      cartItems.innerHTML = items.map((item) => `
        <div class="cart-item" data-id="${escapeHtml(item.id)}">
          <div class="cart-item-img">${item.product.image
            ? `<img class="product-photo" src="${escapeHtml(item.product.image)}" alt="${escapeHtml(item.product.title)}">`
            : ""}</div>
          <div class="cart-item-info">
            <div class="cart-item-title">${escapeHtml(item.product.title)}</div>
            <div class="cart-item-price">${money(item.price)}</div>
            <div class="cart-item-controls">
              <div class="qty-control">
                <button type="button" data-action="dec" data-id="${escapeHtml(item.id)}" aria-label="Decrease quantity">−</button>
                <input class="qty-input" type="number" min="1" max="${item.product.stock}" value="${item.qty}" aria-label="Quantity for ${escapeHtml(item.product.title)}" data-action="qty" data-id="${escapeHtml(item.id)}">
                <button type="button" data-action="inc" data-id="${escapeHtml(item.id)}" aria-label="Increase quantity">+</button>
              </div>
              <button class="remove-item-btn" type="button" data-action="remove" data-id="${escapeHtml(item.id)}">Remove</button>
            </div>
          </div>
        </div>`).join("");
      checkoutButton.disabled = false;
    }
    cartSubtotal.textContent = money(subtotal);
    cartTotal.textContent = money(subtotal);
  }

  async function updateItemQuantity(productId, quantity) {
    const item = cart.find((entry) => entry.id === productId);
    const product = cartProductsById.get(productId);
    if (!item || !product) return;
    const nextQuantity = Math.floor(Number(quantity));
    if (nextQuantity <= 0) {
      cart = cart.filter((entry) => entry.id !== productId);
    } else if (nextQuantity > product.stock) {
      showMessage(`Only ${product.stock} of "${product.title}" are in stock.`, "error");
      return;
    } else {
      item.qty = nextQuantity;
    }
    updateCartBadge();
    renderCartPanel();
    try {
      await persistCart();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  function money(value) {
    return "₱" + Number(value).toLocaleString("en-PH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  function effectivePrice(product) {
    if (product.flashSale && Number(product.salePrice) > 0) return Number(product.salePrice);
    return Number(product.discountPrice) || Number(product.price);
  }

  function createProductImage(product) {
    const frame = document.createElement("span");
    frame.className = "pc-builder-option-image";
    frame.dataset.category = product.category;
    const image = document.createElement("img");
    image.alt = "";
    image.addEventListener("error", () => {
      frame.classList.add("image-missing");
      image.remove();
    }, { once: true });
    frame.append(image);
    if (product.image) image.src = product.image;
    else {
      frame.classList.add("image-missing");
      image.remove();
    }
    return frame;
  }

  function showMessage(message, status) {
    const summary = document.createElement("div");
    summary.className = `pc-builder-summary ${status || "empty"}`;
    summary.textContent = message;
    results.replaceChildren(summary);
  }

  function populateSelect(select, products, category, placeholder) {
    const picker = document.querySelector(`.pc-builder-picker[data-select="${select.id}"]`);
    const summary = picker.querySelector(".pc-builder-picker-summary");
    const optionList = picker.querySelector(".pc-builder-picker-options");
    const entries = products.filter((product) => product.category === category);
    const options = entries.map((product) => {
      const option = document.createElement("option");
      option.value = product.id;
      option.textContent = `${product.title} — ${Number(product.stock) > 0 ? `${product.stock} in stock` : "Out of stock"}`;
      option.disabled = Number(product.stock) <= 0;
      return option;
    });
    select.replaceChildren(new Option(placeholder, ""), ...options);
    optionList.replaceChildren();

    for (const product of entries) {
      const button = document.createElement("button");
      button.className = "pc-builder-option";
      button.type = "button";
      button.setAttribute("role", "option");
      button.disabled = Number(product.stock) <= 0;
      button.setAttribute("aria-selected", "false");

      const image = createProductImage(product);
      const info = document.createElement("span");
      info.className = "pc-builder-option-info";
      const title = document.createElement("strong");
      title.textContent = product.title;
      const stock = document.createElement("small");
      stock.textContent = Number(product.stock) > 0 ? `${product.stock} in stock` : "Out of stock";
      const meta = document.createElement("span");
      meta.className = "pc-builder-option-meta";
      const price = document.createElement("strong");
      price.className = "pc-builder-option-price";
      price.textContent = money(effectivePrice(product));
      meta.append(stock, price);
      if (product.flashSale && Number(product.salePrice) > 0) {
        const badge = document.createElement("span");
        badge.className = "pc-builder-sale-badge";
        badge.textContent = "Flash Sale";
        meta.append(badge);
      }
      info.append(title, meta);
      button.append(image, info);

      button.addEventListener("click", () => {
        select.value = product.id;
        summary.replaceChildren(createProductImage(product));
        const selectedText = document.createElement("span");
        selectedText.className = "pc-builder-selected-title";
        selectedText.textContent = product.title;
        summary.append(selectedText);
        optionList.querySelectorAll(".pc-builder-option").forEach((item) => {
          item.setAttribute("aria-selected", String(item === button));
        });
        picker.open = false;
        select.dispatchEvent(new Event("change"));
      });
      optionList.append(button);
    }

    picker.addEventListener("toggle", () => {
      if (picker.open) {
        document.querySelectorAll(".pc-builder-picker[open]").forEach((otherPicker) => {
          if (otherPicker !== picker) otherPicker.open = false;
        });
      }
    });
    select.addEventListener("change", () => {
      if (select.value) return;
      summary.textContent = placeholder;
      optionList.querySelectorAll(".pc-builder-option").forEach((item) => item.setAttribute("aria-selected", "false"));
    });
  }

  function renderCategories(categories) {
    const links = [];
    const homeLink = document.createElement("a");
    homeLink.href = "/store.html";
    homeLink.textContent = "HOME";
    links.push(homeLink);
    const checkerLink = document.createElement("a");
    checkerLink.href = "/compatibility.html";
    checkerLink.textContent = "Compatibility Checker";
    checkerLink.setAttribute("aria-current", "page");
    links.push(checkerLink);
    for (const category of categories) {
      const link = document.createElement("a");
      link.href = `/store.html?category=${encodeURIComponent(category.id)}`;
      link.textContent = category.name;
      links.push(link);
    }
    nav.replaceChildren(...links);
  }

  async function checkCompatibility() {
    const selection = Object.fromEntries(
      Object.entries(selects).map(([key, select]) => [key, select.value])
    );
    if (!Object.values(selection).some(Boolean)) {
      showMessage("Select at least two components to run a compatibility check.");
      return;
    }

    const version = ++requestVersion;
    try {
      const response = await fetch("/api/pc-builder/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Compatibility check failed.");
      if (version !== requestVersion) return;

      const summary = document.createElement("div");
      summary.className = `pc-builder-summary ${result.overall}`;
      summary.textContent = result.overall === "compatible"
        ? "Selected components pass the available compatibility checks."
        : result.overall === "incompatible"
          ? "At least one selected component combination is incompatible."
          : "Some checks are incomplete. Select the remaining parts and verify any missing specifications.";
      results.replaceChildren(summary);

      if (!result.checks.length) {
        const hint = document.createElement("p");
        hint.className = "pc-builder-empty";
        hint.textContent = "Select at least two components to check their compatibility.";
        results.append(hint);
        return;
      }
      const list = document.createElement("ul");
      list.className = "pc-builder-check-list";
      for (const check of result.checks) {
        const item = document.createElement("li");
        item.className = `pc-builder-check ${check.status}`;
        const title = document.createElement("strong");
        title.textContent = check.label;
        const description = document.createElement("span");
        description.textContent = check.message;
        item.append(title, description);
        list.append(item);
      }
      results.append(list);
    } catch (error) {
      if (version === requestVersion) showMessage(error.message, "error");
    }
  }

  async function addSelectedProductsToCart() {
    const selectedProducts = Object.values(selects)
      .map((select) => productsById.get(select.value))
      .filter(Boolean);
    if (!selectedProducts.length) {
      showMessage("Choose at least one component before adding it to your cart.", "error");
      return;
    }

    const quantityById = new Map(cart.map((item) => [item.id, Number(item.qty) || 0]));
    for (const product of selectedProducts) {
      const updatedQuantity = (quantityById.get(product.id) || 0) + 1;
      if (updatedQuantity > Number(product.stock)) {
        showMessage(`Only ${product.stock} of "${product.title}" are in stock. Remove it or adjust your cart before adding this build.`, "error");
        return;
      }
      quantityById.set(product.id, updatedQuantity);
    }

    try {
      cart = [...quantityById].map(([id, qty]) => ({ id, qty }));
      updateCartBadge();
      renderCartPanel();
      openCart();
      await persistCart();
      showMessage(`${selectedProducts.length} selected ${selectedProducts.length === 1 ? "component was" : "components were"} added to your cart.`, "compatible");
    } catch (error) {
      showMessage(`Items are in your cart on this device, but could not be synced to your account: ${error.message}`, "error");
      openCart();
    }
  }

  addToCartButton.addEventListener("click", addSelectedProductsToCart);
  cartButton.addEventListener("click", openCart);
  document.getElementById("closeCartBtn").addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);
  cartItems.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = cart.find((entry) => entry.id === button.dataset.id);
    if (!item) return;
    if (button.dataset.action === "inc") updateItemQuantity(item.id, item.qty + 1);
    if (button.dataset.action === "dec") updateItemQuantity(item.id, item.qty - 1);
    if (button.dataset.action === "remove") updateItemQuantity(item.id, 0);
  });
  cartItems.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-action='qty']");
    if (input) updateItemQuantity(input.dataset.id, input.value);
  });
  checkoutButton.addEventListener("click", () => {
    window.location.href = "/store.html?openCart=1";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && cartPanel.classList.contains("open")) closeCart();
  });
  resetButton.addEventListener("click", () => {
    Object.values(selects).forEach((select) => {
      select.value = "";
      select.dispatchEvent(new Event("change"));
    });
    requestVersion += 1;
    showMessage("Select components to see compatibility results.");
  });
  Object.values(selects).forEach((select) => {
    select.addEventListener("change", () => {
      if (Object.values(selects).filter((item) => item.value).length >= 2) checkCompatibility();
    });
  });
  window.addEventListener("scroll", () => {
    document.querySelector(".site-header").classList.toggle("scrolled", window.scrollY > 24);
  }, { passive: true });

  updateCartBadge();
  renderCartPanel();
  Promise.all([fetch("/api/categories"), fetch("/api/pc-builder/products"), fetch("/api/products")])
    .then(async ([categoriesResponse, productsResponse, catalogResponse]) => {
      if (!categoriesResponse.ok || !productsResponse.ok || !catalogResponse.ok) {
        throw new Error("The compatibility checker could not load product data. Please refresh to try again.");
      }
      const [categories, products, catalog] = await Promise.all([
        categoriesResponse.json(),
        productsResponse.json(),
        catalogResponse.json()
      ]);
      productsById = new Map(products.map((product) => [product.id, product]));
      cartProductsById = new Map(catalog.map((product) => [product.id, product]));
      cart = cart.flatMap((item) => {
        if (!item || typeof item.id !== "string") return [];
        const product = cartProductsById.get(item.id);
        const quantity = Number(item.qty);
        if (!product || !Number.isInteger(quantity) || quantity < 1 || product.stock <= 0) return [];
        return [{ id: item.id, qty: Math.min(quantity, product.stock) }];
      });
      try {
        await restoreAccountCart();
        if (!authToken) await persistCart();
      } catch (error) {
        console.error("Unable to sync compatibility checker cart:", error);
        showMessage(`Your account cart could not be synced: ${error.message}`, "error");
      }
      renderCartPanel();
      renderCategories(categories);
      populateSelect(selects.cpuId, products, "cpu", "Choose a processor");
      populateSelect(selects.motherboardId, products, "mobo", "Choose a motherboard");
      populateSelect(selects.ramId, products, "ram", "Choose memory");
      populateSelect(selects.gpuId, products, "gpu", "Choose a graphics card");
      populateSelect(selects.caseId, products, "case", "Choose a PC case");
    })
    .catch((error) => {
      console.error("Failed to initialize compatibility checker:", error);
      Object.values(selects).forEach((select) => { select.disabled = true; });
      addToCartButton.disabled = true;
      resetButton.disabled = true;
      showMessage(error.message, "error");
    });
})();
