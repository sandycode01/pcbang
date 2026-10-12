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
  let requestVersion = 0;
  let productsById = new Map();

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

  function addSelectedProductsToCart() {
    const selectedProducts = Object.values(selects)
      .map((select) => productsById.get(select.value))
      .filter(Boolean);
    if (!selectedProducts.length) {
      showMessage("Choose at least one component before adding it to your cart.", "error");
      return;
    }

    let cart;
    try {
      cart = JSON.parse(localStorage.getItem("pcbang_cart") || "[]");
      if (!Array.isArray(cart)) throw new Error("Cart data is invalid.");
    } catch {
      showMessage("Your saved cart could not be read. Open the storefront and clear or repair the cart before continuing.", "error");
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
      const updatedCart = [...quantityById].map(([id, qty]) => ({ id, qty }));
      localStorage.setItem("pcbang_cart", JSON.stringify(updatedCart));
      showMessage(`${selectedProducts.length} selected ${selectedProducts.length === 1 ? "component was" : "components were"} added to your cart.`, "compatible");
    } catch {
      showMessage("Your cart could not be saved in this browser. Check available browser storage and try again.", "error");
    }
  }

  addToCartButton.addEventListener("click", addSelectedProductsToCart);
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

  Promise.all([fetch("/api/categories"), fetch("/api/pc-builder/products")])
    .then(async ([categoriesResponse, productsResponse]) => {
      if (!categoriesResponse.ok || !productsResponse.ok) {
        throw new Error("The compatibility checker could not load product data. Please refresh to try again.");
      }
      const [categories, products] = await Promise.all([
        categoriesResponse.json(),
        productsResponse.json()
      ]);
      productsById = new Map(products.map((product) => [product.id, product]));
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
