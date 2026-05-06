const adminState = {
  sessionToken: localStorage.getItem("kaori-admin-session") || "",
  query: new URLSearchParams(window.location.search),
  currentOrders: [],
  lastNotification: null
};

const adminElements = {
  privateArea: document.getElementById("admin-private"),
  lockedState: document.getElementById("admin-locked-state"),
  openState: document.getElementById("admin-open-state"),
  tokenCard: document.getElementById("token-order"),
  tokenBadge: document.getElementById("token-badge"),
  loginForm: document.getElementById("login-form"),
  pinInput: document.getElementById("pin-input"),
  loginFeedback: document.getElementById("login-feedback"),
  notificationCard: document.getElementById("notification-card"),
  notificationTitle: document.getElementById("notification-title"),
  notificationCopy: document.getElementById("notification-copy"),
  notificationMessage: document.getElementById("notification-message"),
  notificationLink: document.getElementById("notification-link"),
  copyNotification: document.getElementById("copy-notification"),
  ordersList: document.getElementById("orders-list"),
  refreshOrders: document.getElementById("refresh-orders"),
  logoutButton: document.getElementById("logout-button"),
  statPending: document.getElementById("stat-pending"),
  statConfirmed: document.getElementById("stat-confirmed"),
  statReady: document.getElementById("stat-ready"),
  statRejected: document.getElementById("stat-rejected")
};

const adminCurrency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function statusClass(status) {
  if (status === "confirmed") {
    return "confirmed";
  }

  if (status === "ready") {
    return "ready";
  }

  return status === "rejected" ? "rejected" : "pending";
}

function actionLabel(action) {
  if (action === "confirm") {
    return "Pedido confirmado";
  }

  if (action === "ready") {
    return "Pedido pronto";
  }

  return "Pedido recusado";
}

function renderNotificationCard() {
  const data = adminState.lastNotification;
  adminElements.notificationCard.hidden = !data;

  if (!data) {
    adminElements.notificationMessage.textContent = "";
    adminElements.notificationCopy.textContent = "";
    adminElements.notificationLink.href = "#";
    return;
  }

  adminElements.notificationTitle.textContent = actionLabel(data.action);
  adminElements.notificationCopy.textContent =
    "Se o WhatsApp nao abrir sozinho, use os botoes abaixo para abrir o WhatsApp Web ou copiar a mensagem.";
  adminElements.notificationMessage.textContent = data.message;
  adminElements.notificationLink.href = data.url;
}

function renderOrderActions(order, compact = false) {
  const buttons = [];

  if (order.status === "pending") {
    buttons.push(`
      <button class="primary-button button-reset" data-order="${order.id}" data-action="confirm">
        ${compact ? "Confirmar" : "Confirmar pedido"}
      </button>
    `);
    buttons.push(`
      <button class="secondary-button button-reset" data-order="${order.id}" data-action="reject">
        ${compact ? "Recusar" : "Recusar pedido"}
      </button>
    `);
  }

  if (order.status === "confirmed") {
    buttons.push(`
      <button class="primary-button button-reset" data-order="${order.id}" data-action="ready">
        ${compact ? "Pronto" : "Pedido pronto"}
      </button>
    `);
  }

  return buttons.length > 0 ? `<div class="action-row">${buttons.join("")}</div>` : "";
}

function setAdminAccess(isUnlocked) {
  adminElements.privateArea.hidden = !isUnlocked;
  adminElements.lockedState.hidden = isUnlocked;
  adminElements.openState.hidden = !isUnlocked;
}

function resetPrivateView() {
  adminState.currentOrders = [];
  adminState.lastNotification = null;
  adminElements.tokenCard.dataset.token = "";
  adminElements.ordersList.className = "admin-orders empty-box";
  adminElements.ordersList.textContent = "Entre com o PIN para ver a fila completa.";
  adminElements.statPending.textContent = "0";
  adminElements.statConfirmed.textContent = "0";
  adminElements.statReady.textContent = "0";
  adminElements.statRejected.textContent = "0";
  renderNotificationCard();

  if (adminState.query.get("order")) {
    adminElements.tokenBadge.textContent = "Aguardando PIN";
    adminElements.tokenBadge.className = "status-pill pending";
    adminElements.tokenCard.className = "detail-panel empty-box";
    adminElements.tokenCard.textContent =
      "Digite o PIN para liberar os detalhes do pedido recebido no WhatsApp.";
    return;
  }

  adminElements.tokenBadge.textContent = "Sem token";
  adminElements.tokenBadge.className = "status-pill";
  adminElements.tokenCard.className = "detail-panel empty-box";
  adminElements.tokenCard.textContent =
    "Abra esta tela por um link do WhatsApp para carregar um pedido especifico.";
}

async function login(event) {
  event.preventDefault();
  const pin = adminElements.pinInput.value.trim();
  if (!pin) {
    adminElements.loginFeedback.textContent = "Informe o PIN.";
    return;
  }

  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  });

  const data = await response.json();
  if (!response.ok) {
    adminElements.loginFeedback.textContent = data.error || "Nao foi possivel autenticar.";
    return;
  }

  adminState.sessionToken = data.sessionToken;
  localStorage.setItem("kaori-admin-session", data.sessionToken);
  adminElements.loginFeedback.textContent = "Acesso liberado.";
  adminElements.pinInput.value = "";
  setAdminAccess(true);
  await loadPrivateContent();
}

async function fetchOrderByToken() {
  const orderId = adminState.query.get("order");
  const token = adminState.query.get("token");
  if (!orderId || !token) {
    adminElements.tokenBadge.textContent = "Sem token";
    adminElements.tokenBadge.className = "status-pill";
    return;
  }

  const response = await fetch(
    `/api/orders/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}`
  );
  const data = await response.json();
  if (!response.ok) {
    adminElements.tokenBadge.textContent = "Link invalido";
    adminElements.tokenBadge.className = "status-pill rejected";
    adminElements.tokenCard.textContent = data.error || "Nao foi possivel carregar o pedido.";
    return;
  }

  adminElements.tokenBadge.textContent = data.order.statusCopy.label;
  adminElements.tokenBadge.className = `status-pill ${statusClass(data.order.status)}`;
  renderDetailedOrder(adminElements.tokenCard, data.order, token);
}

function updateStats(orders) {
  const counts = orders.reduce(
    (acc, order) => {
      acc[order.status] += 1;
      return acc;
    },
    { pending: 0, confirmed: 0, ready: 0, rejected: 0 }
  );

  adminElements.statPending.textContent = counts.pending;
  adminElements.statConfirmed.textContent = counts.confirmed;
  adminElements.statReady.textContent = counts.ready;
  adminElements.statRejected.textContent = counts.rejected;
}

function renderDetailedOrder(container, order, token) {
  const itemLines = order.items
    .map((item) => `<li>${item.quantity}x ${item.name} <strong>${adminCurrency(item.total)}</strong></li>`)
    .join("");

  container.className = "detail-panel";
  container.innerHTML = `
    <div class="detail-head">
      <div>
        <p class="eyebrow">Pedido ${order.id}</p>
        <h3>${order.customer.name}</h3>
      </div>
      <span class="status-pill ${statusClass(order.status)}">${order.statusCopy.label}</span>
    </div>
    <div class="detail-meta">
      <span>${order.customer.phone}</span>
      <span>${order.customer.serviceType === "delivery" ? "Entrega" : "Retirada"}</span>
      <span>${formatDate(order.createdAt)}</span>
    </div>
    <ul class="detail-list">${itemLines}</ul>
    <div class="detail-grid">
      <article><span>Total</span><strong>${adminCurrency(order.totals.total)}</strong></article>
      <article><span>Pagamento</span><strong>${order.customer.paymentMethod}</strong></article>
      <article><span>Endereco</span><strong>${order.customer.address ? `${order.customer.address.street}, ${order.customer.address.number} - ${order.customer.address.neighborhood}` : "Retirada no local"}</strong></article>
      <article><span>Observacoes</span><strong>${order.customer.notes || "Sem observacoes"}</strong></article>
    </div>
    ${renderOrderActions(order)}
  `;

  container.dataset.token = token || "";
}

function renderOrders() {
  if (!adminState.currentOrders.length) {
    adminElements.ordersList.className = "admin-orders empty-box";
    adminElements.ordersList.textContent = "Nenhum pedido encontrado.";
    return;
  }

  adminElements.ordersList.className = "admin-orders";
  adminElements.ordersList.innerHTML = adminState.currentOrders
    .map(
      (order) => `
        <article class="queue-card">
          <div class="queue-head">
            <div>
              <p class="eyebrow">${order.id}</p>
              <h3>${order.customer.name}</h3>
            </div>
            <span class="status-pill ${statusClass(order.status)}">${order.statusCopy.label}</span>
          </div>
          <p class="queue-copy">${order.items.map((item) => `${item.quantity}x ${item.name}`).join(" | ")}</p>
          <div class="queue-meta">
            <span>${adminCurrency(order.totals.total)}</span>
            <span>${order.customer.serviceType === "delivery" ? "Entrega" : "Retirada"}</span>
            <span>${formatDate(order.createdAt)}</span>
          </div>
          ${renderOrderActions(order, true)}
        </article>
      `
    )
    .join("");
}

async function loadOrders() {
  if (!adminState.sessionToken) {
    return false;
  }

  const response = await fetch("/api/admin/orders", {
    headers: { "x-admin-session": adminState.sessionToken }
  });

  const data = await response.json();
  if (!response.ok) {
    adminElements.loginFeedback.textContent = data.error || "Sessao expirada.";
    localStorage.removeItem("kaori-admin-session");
    adminState.sessionToken = "";
    setAdminAccess(false);
    resetPrivateView();
    return false;
  }

  adminState.currentOrders = data.orders;
  updateStats(data.orders);
  renderOrders();
  return true;
}

async function loadPrivateContent() {
  const hasAccess = await loadOrders();
  if (!hasAccess) {
    return false;
  }

  await fetchOrderByToken();
  setAdminAccess(true);
  return true;
}

function logout() {
  adminState.sessionToken = "";
  localStorage.removeItem("kaori-admin-session");
  adminElements.loginFeedback.textContent = "Painel bloqueado.";
  setAdminAccess(false);
  resetPrivateView();
}

async function updateOrderStatus(orderId, action, token) {
  const notificationWindow =
    action === "confirm" || action === "ready" || action === "reject"
      ? window.open("about:blank", "_blank")
      : null;
  const reason =
    action === "reject" ? window.prompt("Motivo da recusa", "Item em falta no momento.") || "" : "";

  const headers = { "Content-Type": "application/json" };
  if (adminState.sessionToken) {
    headers["x-admin-session"] = adminState.sessionToken;
  }

  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/${action}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      token: token || undefined,
      reason
    })
  });

  const data = await response.json();
  if (!response.ok) {
    notificationWindow?.close();
    window.alert(data.error || "Nao foi possivel atualizar o pedido.");
    return;
  }

  if (adminState.query.get("order") === orderId && adminState.query.get("token")) {
    renderDetailedOrder(adminElements.tokenCard, data.order, adminState.query.get("token"));
    adminElements.tokenBadge.textContent = data.order.statusCopy.label;
    adminElements.tokenBadge.className = `status-pill ${statusClass(data.order.status)}`;
  }

  if (data.customerWhatsAppUrl && data.customerWhatsAppMessage) {
    adminState.lastNotification = {
      action,
      url: data.customerWhatsAppWebUrl || data.customerWhatsAppUrl,
      message: data.customerWhatsAppMessage
    };
    renderNotificationCard();

    if (notificationWindow && !notificationWindow.closed) {
      try {
        notificationWindow.location.href = data.customerWhatsAppWebUrl || data.customerWhatsAppUrl;
      } catch {
        notificationWindow.close();
      }
    }
  } else if (notificationWindow) {
    notificationWindow.close();
  }

  await loadOrders();
}

function bindAdminEvents() {
  adminElements.loginForm.addEventListener("submit", login);
  adminElements.refreshOrders.addEventListener("click", loadPrivateContent);
  adminElements.logoutButton.addEventListener("click", logout);
  adminElements.copyNotification.addEventListener("click", async () => {
    const message = adminState.lastNotification?.message || "";
    if (!message) {
      return;
    }

    await navigator.clipboard.writeText(message);
    adminElements.notificationCopy.textContent = "Mensagem copiada.";
  });

  document.body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const orderId = button.getAttribute("data-order");
    const action = button.getAttribute("data-action");
    const token =
      adminElements.tokenCard.dataset.token && adminState.query.get("order") === orderId
        ? adminElements.tokenCard.dataset.token
        : "";

    updateOrderStatus(orderId, action, token);
  });
}

async function initAdmin() {
  bindAdminEvents();
  resetPrivateView();
  setAdminAccess(false);

  if (adminState.sessionToken) {
    const hasAccess = await loadPrivateContent();
    if (hasAccess) {
      adminElements.loginFeedback.textContent = "Sessao administrativa ativa.";
    }
  }
}

initAdmin().catch((error) => {
  console.error(error);
  window.alert("Nao foi possivel carregar o painel.");
});
