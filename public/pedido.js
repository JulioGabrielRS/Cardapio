const trackingQuery = new URLSearchParams(window.location.search);
const trackingElements = {
  form: document.getElementById("tracking-form"),
  inputId: document.getElementById("tracking-id"),
  inputToken: document.getElementById("tracking-token"),
  card: document.getElementById("tracking-card"),
  recentOrdersPanel: document.getElementById("recent-orders-panel"),
  recentOrdersList: document.getElementById("recent-orders-list")
};

const trackingCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));

function formatWhen(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date(value));
}

function orderHistoryApi() {
  return window.kaoriOrderHistory;
}

function restoreTrackingAccess() {
  return orderHistoryApi()?.loadLastOrder() || null;
}

function saveTrackingAccess(order, token) {
  orderHistoryApi()?.saveOrder({
    id: order.id,
    token,
    trackingUrl: orderHistoryApi()?.buildTrackingUrl(order.id, token),
    createdAt: order.createdAt,
    total: order.totals.total,
    status: order.status,
    statusLabel: order.statusCopy.label
  });
}

function renderRecentOrders(activeId, activeToken) {
  const history = orderHistoryApi()?.loadHistory() || [];
  trackingElements.recentOrdersPanel.hidden = history.length === 0;

  if (history.length === 0) {
    trackingElements.recentOrdersList.innerHTML = "";
    return;
  }

  trackingElements.recentOrdersList.innerHTML = history
    .map((entry) => {
      const isActive = entry.id === activeId && entry.token === activeToken;
      const when = entry.createdAt ? formatWhen(entry.createdAt) : "Pedido salvo neste aparelho";
      const totalLabel = entry.total ? trackingCurrency(entry.total) : "Em acompanhamento";

      return `
        <button
          type="button"
          class="recent-order-button${isActive ? " active" : ""}"
          data-id="${entry.id}"
          data-token="${entry.token}"
        >
          <span class="recent-order-code">${entry.id}</span>
          <strong>${entry.statusLabel || "Acompanhar pedido"}</strong>
          <span>${when}</span>
          <span>${totalLabel}</span>
        </button>
      `;
    })
    .join("");
}

function renderTracking(order) {
  const items = order.items
    .map((item) => `<li>${item.quantity}x ${item.name} <strong>${trackingCurrency(item.total)}</strong></li>`)
    .join("");
  const timeline = order.timeline
    .map(
      (entry) => `
        <article class="timeline-item ${entry.status}">
          <span>${formatWhen(entry.at)}</span>
          <strong>${entry.label}</strong>
          <p>${entry.description}</p>
        </article>
      `
    )
    .join("");

  trackingElements.card.className = "tracking-card";
  trackingElements.card.innerHTML = `
    <div class="detail-head">
      <div>
        <p class="eyebrow">Pedido ${order.id}</p>
        <h2>${order.statusCopy.label}</h2>
      </div>
      <span class="status-pill ${order.status}">${order.statusCopy.label}</span>
    </div>
    <p class="section-copy">${order.statusCopy.description}</p>
    <div class="detail-grid">
      <article><span>Criado em</span><strong>${formatWhen(order.createdAt)}</strong></article>
      <article><span>Total</span><strong>${trackingCurrency(order.totals.total)}</strong></article>
      <article><span>Atendimento</span><strong>${order.customer.serviceType === "delivery" ? "Entrega" : "Retirada"}</strong></article>
      <article><span>Previsao apos confirmacao</span><strong>${order.estimatedMinutes} min</strong></article>
    </div>
    <div class="tracking-columns">
      <div>
        <h3>Itens</h3>
        <ul class="detail-list">${items}</ul>
      </div>
      <div>
        <h3>Andamento</h3>
        <div class="timeline">${timeline}</div>
      </div>
    </div>
    ${order.status === "rejected" ? `<div class="warning-box">Motivo informado pela loja: ${order.decision || "Sem motivo informado."}</div>` : ""}
  `;
}

async function fetchTracking(id, token) {
  const response = await fetch(`/api/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
  const data = await response.json();

  if (!response.ok) {
    trackingElements.card.className = "tracking-card empty-box";
    trackingElements.card.textContent = data.error || "Nao foi possivel localizar o pedido.";
    return;
  }

  saveTrackingAccess(data.order, token);
  renderRecentOrders(id, token);
  renderTracking(data.order);
}

function loadFromLocation() {
  const id = trackingQuery.get("id");
  const token = trackingQuery.get("token");

  if (id && token) {
    trackingElements.inputId.value = id;
    trackingElements.inputToken.value = token;
    renderRecentOrders(id, token);
    fetchTracking(id, token);
    return;
  }

  const lastOrder = restoreTrackingAccess();
  if (lastOrder?.id && lastOrder?.token) {
    trackingElements.inputId.value = lastOrder.id;
    trackingElements.inputToken.value = lastOrder.token;
    renderRecentOrders(lastOrder.id, lastOrder.token);
    fetchTracking(lastOrder.id, lastOrder.token);
    return;
  }

  renderRecentOrders();
}

trackingElements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = trackingElements.inputId.value.trim();
  const token = trackingElements.inputToken.value.trim();
  if (!id || !token) {
    trackingElements.card.className = "tracking-card empty-box";
    trackingElements.card.textContent = "Informe o codigo e o token do pedido.";
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("id", id);
  url.searchParams.set("token", token);
  window.history.replaceState({}, "", url);
  fetchTracking(id, token);
});

trackingElements.recentOrdersList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id][data-token]");
  if (!button) {
    return;
  }

  const id = button.getAttribute("data-id");
  const token = button.getAttribute("data-token");
  trackingElements.inputId.value = id;
  trackingElements.inputToken.value = token;

  const url = new URL(window.location.href);
  url.searchParams.set("id", id);
  url.searchParams.set("token", token);
  window.history.replaceState({}, "", url);
  fetchTracking(id, token);
});

loadFromLocation();
setInterval(() => {
  const id = trackingElements.inputId.value.trim();
  const token = trackingElements.inputToken.value.trim();
  if (id && token) {
    fetchTracking(id, token);
  }
}, 15000);
