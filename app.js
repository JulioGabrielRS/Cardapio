const formatCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));

const state = {
  store: null,
  cart: new Map(),
  serviceType: "delivery",
  submitting: false
};

const elements = {
  menuRoot: document.getElementById("menu-root"),
  cartList: document.getElementById("cart-list"),
  cartEmpty: document.getElementById("cart-empty"),
  subtotalValue: document.getElementById("subtotal-value"),
  deliveryValue: document.getElementById("delivery-value"),
  totalValue: document.getElementById("total-value"),
  form: document.getElementById("checkout-form"),
  minimumNote: document.getElementById("minimum-note"),
  floatingTrackingShortcut: document.getElementById("floating-tracking-shortcut"),
  floatingTrackingCount: document.getElementById("floating-tracking-count"),
  checkoutModal: document.getElementById("checkout-modal"),
  checkoutEmpty: document.getElementById("checkout-empty"),
  checkoutCartList: document.getElementById("checkout-cart-list"),
  checkoutSubtotalValue: document.getElementById("checkout-subtotal-value"),
  checkoutDeliveryValue: document.getElementById("checkout-delivery-value"),
  checkoutTotalValue: document.getElementById("checkout-total-value"),
  openCheckout: document.getElementById("open-checkout"),
  closeCheckout: document.getElementById("close-checkout"),
  successModal: document.getElementById("success-modal"),
  resultTitle: document.getElementById("result-title"),
  resultCopy: document.getElementById("result-copy"),
  resultSummary: document.getElementById("result-summary"),
  whatsappLink: document.getElementById("whatsapp-link"),
  trackingLink: document.getElementById("tracking-link"),
  closeResult: document.getElementById("close-result"),
  heroChip: document.getElementById("hero-chip"),
  heroTitle: document.getElementById("hero-title"),
  heroDescription: document.getElementById("hero-description"),
  heroHighlights: document.getElementById("hero-highlights"),
  businessRules: document.getElementById("business-rules"),
  segments: Array.from(document.querySelectorAll(".segment")),
  addressFields: document.getElementById("address-fields"),
  paymentSelect: document.querySelector('select[name="paymentMethod"]'),
  changeWrapper: document.getElementById("change-wrapper"),
  submitOrder: document.getElementById("submit-order"),
  trackingShortcut: document.getElementById("tracking-shortcut")
};

function menuItems() {
  if (!state.store) {
    return [];
  }

  return state.store.categories.flatMap((category) => category.items);
}

function itemById(id) {
  return menuItems().find((item) => item.id === id);
}

function cartEntries() {
  return Array.from(state.cart.entries()).filter(([, quantity]) => quantity > 0);
}

function cartTotals() {
  const subtotal = Array.from(state.cart.entries()).reduce((sum, [itemId, quantity]) => {
    const item = itemById(itemId);
    return item ? sum + item.price * quantity : sum;
  }, 0);

  const deliveryFee =
    state.serviceType === "delivery" && subtotal > 0
      ? Number(state.store.business.deliveryFee || 0)
      : 0;

  return {
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee
  };
}

function orderHistoryApi() {
  return window.kaoriOrderHistory;
}

function refreshTrackingShortcuts() {
  const history = orderHistoryApi()?.loadHistory() || [];
  const latestOrder = history[0] || null;
  const targetUrl = latestOrder?.trackingUrl || "/pedido.html";
  const buttonLabel = history.length > 0 ? "Meus pedidos" : "Acompanhar pedido";

  elements.trackingShortcut.href = targetUrl;
  elements.floatingTrackingShortcut.href = targetUrl;
  elements.floatingTrackingShortcut.querySelector(".floating-shortcut__label").textContent =
    buttonLabel;

  if (history.length > 0) {
    elements.floatingTrackingCount.hidden = false;
    elements.floatingTrackingCount.textContent = String(history.length);
    return;
  }

  elements.floatingTrackingCount.hidden = true;
  elements.floatingTrackingCount.textContent = "0";
}

function renderHero() {
  const { hero, highlights, business } = state.store;
  elements.heroChip.textContent = hero.eyebrow;
  elements.heroTitle.textContent = hero.headline;
  elements.heroDescription.textContent = hero.description;
  elements.heroHighlights.innerHTML = "";

  highlights.forEach((text) => {
    const badge = document.createElement("span");
    badge.className = "meta-chip";
    badge.textContent = text;
    elements.heroHighlights.appendChild(badge);
  });

  elements.businessRules.textContent = `Saidas de ${business.address}. ${business.hours.join(
    " | "
  )}. Pedido minimo de ${formatCurrency(business.minimumOrder)}.`;
}

function renderMenu() {
  elements.menuRoot.innerHTML = "";
  state.store.categories.forEach((category, categoryIndex) => {
    const section = document.createElement("section");
    section.className = "menu-category reveal";
    section.style.setProperty("--delay", `${categoryIndex * 80}ms`);

    const header = document.createElement("div");
    header.className = "category-head";
    header.innerHTML = `
      <div>
        <p class="eyebrow">${category.title}</p>
        <h3>${category.description}</h3>
      </div>
    `;
    section.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "item-grid";

    category.items.forEach((item) => {
      const quantity = state.cart.get(item.id) || 0;
      const card = document.createElement("article");
      card.className = "menu-item";
      card.innerHTML = `
        <div class="item-topline">
          <span class="item-badge">${item.badge}</span>
          <strong>${formatCurrency(item.price)}</strong>
        </div>
        <h4>${item.name}</h4>
        <p>${item.description}</p>
        <div class="item-actions">
          <div class="stepper" data-item="${item.id}">
            <button type="button" data-action="decrease" aria-label="Diminuir ${item.name}">-</button>
            <span>${quantity}</span>
            <button type="button" data-action="increase" aria-label="Adicionar ${item.name}">+</button>
          </div>
          <button type="button" class="text-button add-button" data-add="${item.id}">
            ${quantity > 0 ? "Adicionar mais" : "Adicionar"}
          </button>
        </div>
      `;
      grid.appendChild(card);
    });

    section.appendChild(grid);
    elements.menuRoot.appendChild(section);
  });
}

function renderCart() {
  const entries = cartEntries();
  const totals = cartTotals();

  elements.cartList.innerHTML = "";
  elements.checkoutCartList.innerHTML = "";
  elements.cartEmpty.hidden = entries.length > 0;
  elements.checkoutEmpty.hidden = entries.length > 0;

  entries.forEach(([itemId, quantity]) => {
    const item = itemById(itemId);
    if (!item) {
      return;
    }

    const row = document.createElement("article");
    row.className = "cart-item";
    row.innerHTML = `
      <div>
        <h4>${item.name}</h4>
        <p>${quantity} x ${formatCurrency(item.price)}</p>
      </div>
      <div class="cart-side">
        <strong>${formatCurrency(item.price * quantity)}</strong>
        <div class="stepper compact" data-item="${item.id}">
          <button type="button" data-action="decrease" aria-label="Diminuir ${item.name}">-</button>
          <span>${quantity}</span>
          <button type="button" data-action="increase" aria-label="Adicionar ${item.name}">+</button>
        </div>
      </div>
    `;
    elements.cartList.appendChild(row);

    const previewRow = document.createElement("article");
    previewRow.className = "cart-item compact-row";
    previewRow.innerHTML = `
      <div>
        <h4>${item.name}</h4>
        <p>${quantity} x ${formatCurrency(item.price)}</p>
      </div>
      <div class="cart-side">
        <strong>${formatCurrency(item.price * quantity)}</strong>
      </div>
    `;
    elements.checkoutCartList.appendChild(previewRow);
  });

  elements.subtotalValue.textContent = formatCurrency(totals.subtotal);
  elements.deliveryValue.textContent =
    state.serviceType === "delivery" ? formatCurrency(totals.deliveryFee) : "Retirada";
  elements.totalValue.textContent = formatCurrency(totals.total);
  elements.checkoutSubtotalValue.textContent = formatCurrency(totals.subtotal);
  elements.checkoutDeliveryValue.textContent =
    state.serviceType === "delivery" ? formatCurrency(totals.deliveryFee) : "Retirada";
  elements.checkoutTotalValue.textContent = formatCurrency(totals.total);
  elements.minimumNote.textContent = `Pedido minimo da casa: ${formatCurrency(
    state.store.business.minimumOrder
  )}.`;
  elements.submitOrder.disabled = entries.length === 0 || state.submitting;
  elements.openCheckout.disabled = entries.length === 0;
}

function updateServiceType(nextType) {
  state.serviceType = nextType;
  elements.segments.forEach((button) => {
    button.classList.toggle("active", button.dataset.service === nextType);
  });

  const hideAddress = nextType === "pickup";
  elements.addressFields.hidden = hideAddress;
  Array.from(elements.addressFields.querySelectorAll("input")).forEach((input) => {
    input.disabled = hideAddress;
    if (hideAddress) {
      input.value = "";
    }
  });

  renderCart();
}

function updatePaymentVisibility() {
  const showChange = elements.paymentSelect.value === "cash";
  elements.changeWrapper.classList.toggle("hidden-field", !showChange);
}

function changeItemQuantity(itemId, delta) {
  const current = state.cart.get(itemId) || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    state.cart.delete(itemId);
  } else {
    state.cart.set(itemId, next);
  }
  renderMenu();
  renderCart();
}

function cartPayload() {
  return cartEntries().map(([id, quantity]) => ({ id, quantity }));
}

function openCheckoutModal() {
  if (cartEntries().length === 0) {
    return;
  }

  elements.checkoutModal.showModal();
}

function closeCheckoutModal() {
  if (elements.checkoutModal.open) {
    elements.checkoutModal.close();
  }
}

async function submitOrder(event) {
  event.preventDefault();
  if (state.submitting) {
    return;
  }

  const formData = new FormData(elements.form);
  const payload = {
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    serviceType: state.serviceType,
    paymentMethod: formData.get("paymentMethod"),
    changeFor: formData.get("changeFor"),
    notes: formData.get("notes"),
    address: {
      street: formData.get("street"),
      number: formData.get("number"),
      neighborhood: formData.get("neighborhood"),
      reference: formData.get("reference")
    },
    items: cartPayload()
  };

  state.submitting = true;
  elements.submitOrder.disabled = true;
  elements.submitOrder.textContent = "Enviando...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Nao foi possivel criar o pedido.");
    }

    const orderInfo = {
      id: data.order.id,
      token: new URL(data.trackingUrl).searchParams.get("token"),
      trackingUrl: data.trackingUrl,
      createdAt: data.order.createdAt,
      total: data.order.totals.total,
      status: data.order.status,
      statusLabel: "Aguardando confirmacao"
    };
    orderHistoryApi()?.saveOrder(orderInfo);
    refreshTrackingShortcuts();

    state.cart.clear();
    elements.form.reset();
    updateServiceType("delivery");
    updatePaymentVisibility();
    renderMenu();
    renderCart();
    closeCheckoutModal();

    elements.resultTitle.textContent = `Pedido ${data.order.id} aguardando confirmacao`;
    elements.resultCopy.textContent = `O WhatsApp abre com a mensagem pronta para a loja. Depois do envio, a proprietaria aprova antes do preparo. Tempo estimado apos confirmacao: ${data.order.estimatedMinutes} minutos.`;
    elements.resultSummary.innerHTML = `
      <div>
        <span>Status atual</span>
        <strong>Aguardando confirmacao</strong>
      </div>
      <div>
        <span>Total</span>
        <strong>${formatCurrency(data.order.totals.total)}</strong>
      </div>
    `;
    elements.whatsappLink.href = data.whatsappUrl;
    elements.trackingLink.href = data.trackingUrl;

    elements.successModal.showModal();
    window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    window.alert(error.message);
  } finally {
    state.submitting = false;
    elements.submitOrder.disabled = false;
    elements.submitOrder.textContent = "Enviar pedido para confirmacao";
  }
}

function bindEvents() {
  elements.menuRoot.addEventListener("click", (event) => {
    const addId = event.target.getAttribute("data-add");
    if (addId) {
      changeItemQuantity(addId, 1);
      return;
    }

    const action = event.target.getAttribute("data-action");
    const stepper = event.target.closest(".stepper");
    if (!action || !stepper) {
      return;
    }

    const itemId = stepper.dataset.item;
    changeItemQuantity(itemId, action === "increase" ? 1 : -1);
  });

  elements.cartList.addEventListener("click", (event) => {
    const action = event.target.getAttribute("data-action");
    const stepper = event.target.closest(".stepper");
    if (!action || !stepper) {
      return;
    }

    changeItemQuantity(stepper.dataset.item, action === "increase" ? 1 : -1);
  });

  elements.segments.forEach((button) => {
    button.addEventListener("click", () => updateServiceType(button.dataset.service));
  });

  elements.paymentSelect.addEventListener("change", updatePaymentVisibility);
  elements.openCheckout.addEventListener("click", openCheckoutModal);
  elements.closeCheckout.addEventListener("click", closeCheckoutModal);
  elements.form.addEventListener("submit", submitOrder);
  elements.closeResult.addEventListener("click", () => elements.successModal.close());
  elements.checkoutModal.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeCheckoutModal();
  });
}

async function init() {
  bindEvents();
  updatePaymentVisibility();
  refreshTrackingShortcuts();

  const response = await fetch("/api/store");
  const store = await response.json();
  state.store = store;
  document.title = store.business.name;
  document.querySelector(".brand").textContent = store.business.name;
  document.getElementById("hero-eyebrow").textContent = store.business.tagline;
  renderHero();
  renderMenu();
  renderCart();
}

init().catch((error) => {
  console.error(error);
  window.alert("Nao foi possivel carregar o cardapio.");
});
