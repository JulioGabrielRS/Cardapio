const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const STORE_EXAMPLE_FILE = path.join(DATA_DIR, "store.example.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const MAX_BODY_BYTES = 1024 * 1024;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".bmp": "image/bmp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const adminSessions = new Map();

function money(value) {
  return Number(value).toFixed(2);
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value));
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function sanitizeStore(rawStore) {
  const { owner, ...publicStore } = rawStore;
  return publicStore;
}

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(STORE_FILE);
  } catch {
    try {
      await fs.access(STORE_EXAMPLE_FILE);
      const template = await fs.readFile(STORE_EXAMPLE_FILE, "utf8");
      await fs.writeFile(STORE_FILE, template, "utf8");
    } catch {
      throw new Error("Arquivo data/store.json nao encontrado e data/store.example.json tambem nao esta disponivel.");
    }
  }

  try {
    await fs.access(ORDERS_FILE);
  } catch {
    await fs.writeFile(ORDERS_FILE, "[]\n", "utf8");
  }
}

async function readJson(filePath) {
  const file = await fs.readFile(filePath, "utf8");
  return JSON.parse(file);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function loadStore() {
  return readJson(STORE_FILE);
}

async function loadOrders() {
  const data = await readJson(ORDERS_FILE);
  return Array.isArray(data) ? data : [];
}

async function saveOrders(orders) {
  await writeJson(ORDERS_FILE, orders);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function notFound(res) {
  sendJson(res, 404, { error: "Nao encontrado." });
}

function badRequest(res, message) {
  sendJson(res, 400, { error: message });
}

function unauthorized(res, message = "Acesso nao autorizado.") {
  sendJson(res, 401, { error: message });
}

function conflict(res, message) {
  sendJson(res, 409, { error: message });
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;

    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        reject(new Error("Corpo da requisicao excedeu o limite suportado."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON invalido no corpo da requisicao."));
      }
    });

    req.on("error", reject);
  });
}

function getMenuIndex(store) {
  const menuIndex = new Map();
  for (const category of store.categories || []) {
    for (const item of category.items || []) {
      menuIndex.set(item.id, { ...item, categoryId: category.id, categoryName: category.title });
    }
  }
  return menuIndex;
}

function getBaseUrl(req, store) {
  const configured =
    process.env.PUBLIC_BASE_URL ||
    store.business.publicBaseUrl ||
    `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;

  return configured.replace(/\/$/, "");
}

function createOrderId(existingIds) {
  let orderId = "";
  do {
    orderId = `KS-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  } while (existingIds.has(orderId));
  return orderId;
}

function createToken(size = 16) {
  return crypto.randomBytes(size).toString("hex");
}

function formatAddress(address) {
  if (!address) {
    return "Nao informado";
  }

  const segments = [address.street, address.number, address.neighborhood].filter(Boolean);
  const mainLine = segments.join(", ");
  const reference = address.reference ? ` | Ref.: ${address.reference}` : "";
  return `${mainLine || "Retirada no local"}${reference}`;
}

function formatPayment(order) {
  if (order.customer.paymentMethod === "cash" && order.customer.changeFor) {
    return `Dinheiro (troco para ${currency(order.customer.changeFor)})`;
  }

  if (order.customer.paymentMethod === "card") {
    return "Cartao na entrega/retirada";
  }

  return "Pix";
}

function buildWhatsAppMessage(order, store, baseUrl) {
  const lines = [
    `Novo pedido ${order.id}`,
    "",
    `Cliente: ${order.customer.name}`,
    `Telefone: ${order.customer.phone}`,
    `Atendimento: ${order.customer.serviceType === "delivery" ? "Entrega" : "Retirada"}`,
    `Endereco: ${formatAddress(order.customer.address)}`,
    "",
    "Itens:"
  ];

  for (const item of order.items) {
    lines.push(`- ${item.quantity}x ${item.name} (${currency(item.total)})`);
  }

  lines.push("");
  lines.push(`Subtotal: ${currency(order.totals.subtotal)}`);
  if (order.totals.deliveryFee > 0) {
    lines.push(`Entrega: ${currency(order.totals.deliveryFee)}`);
  }
  lines.push(`Total: ${currency(order.totals.total)}`);
  lines.push(`Pagamento: ${formatPayment(order)}`);
  if (order.customer.notes) {
    lines.push(`Observacoes: ${order.customer.notes}`);
  }
  lines.push("");
  lines.push("Confirmar ou recusar no painel:");
  lines.push(`${baseUrl}/admin.html?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.ownerToken)}`);
  lines.push("");
  lines.push("Acompanhar pelo link do cliente:");
  lines.push(`${baseUrl}/pedido.html?id=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.customerToken)}`);

  return lines.join("\n");
}

function buildCustomerStatusMessage(order, store, baseUrl, type) {
  const trackingUrl = `${baseUrl}/pedido.html?id=${encodeURIComponent(order.id)}&token=${encodeURIComponent(
    order.customerToken
  )}`;
  const lines = [`${store.business.name} - pedido ${order.id}`, ""];

  if (type === "confirm") {
    lines.push("Seu pedido foi confirmado.");
    lines.push(`Tempo estimado: ${order.estimatedMinutes} minutos.`);
  }

  if (type === "ready") {
    lines.push(
      order.customer.serviceType === "pickup"
        ? "Seu pedido esta pronto para retirada."
        : "Seu pedido esta pronto e aguardando saida para entrega."
    );
  }

  if (type === "reject") {
    lines.push("Nao foi possivel aprovar o seu pedido.");
    lines.push(`Motivo: ${order.decision || "Sem motivo informado."}`);
  }

  lines.push("");
  lines.push(`Acompanhar pedido: ${trackingUrl}`);
  return lines.join("\n");
}

function buildWhatsAppLinks(phone, message) {
  const cleanPhone = onlyDigits(phone);
  const encodedMessage = encodeURIComponent(message);

  return {
    appUrl: `https://wa.me/${cleanPhone}?text=${encodedMessage}`,
    webUrl: `https://web.whatsapp.com/send/?phone=${cleanPhone}&text=${encodedMessage}&type=phone_number&app_absent=0`
  };
}

function buildOrderResponse(order) {
  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    estimatedMinutes: order.estimatedMinutes,
    items: order.items,
    totals: order.totals,
    customer: {
      name: order.customer.name,
      phone: order.customer.phone,
      serviceType: order.customer.serviceType,
      address: order.customer.address,
      paymentMethod: order.customer.paymentMethod,
      changeFor: order.customer.changeFor,
      notes: order.customer.notes
    },
    timeline: order.timeline,
    decision: order.decision || null
  };
}

function createAdminSession() {
  const token = createToken(18);
  adminSessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function hasAdminSession(req) {
  const sessionToken = req.headers["x-admin-session"];
  if (!sessionToken || typeof sessionToken !== "string") {
    return false;
  }

  const session = adminSessions.get(sessionToken);
  if (!session) {
    return false;
  }

  if (Date.now() > session.expiresAt) {
    adminSessions.delete(sessionToken);
    return false;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return true;
}

function validateOrderPayload(payload, store) {
  const menuIndex = getMenuIndex(store);
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (items.length === 0) {
    return { error: "Adicione pelo menos um item ao pedido." };
  }

  const customerName = String(payload.customerName || "").trim();
  if (customerName.length < 2) {
    return { error: "Informe o nome do cliente." };
  }

  const customerPhone = onlyDigits(payload.customerPhone);
  if (customerPhone.length < 10) {
    return { error: "Informe um telefone valido." };
  }

  const serviceType = payload.serviceType === "pickup" ? "pickup" : "delivery";
  const paymentMethod = ["pix", "card", "cash"].includes(payload.paymentMethod)
    ? payload.paymentMethod
    : "pix";

  const address = {
    street: String(payload.address?.street || "").trim(),
    number: String(payload.address?.number || "").trim(),
    neighborhood: String(payload.address?.neighborhood || "").trim(),
    reference: String(payload.address?.reference || "").trim()
  };

  if (serviceType === "delivery") {
    if (!address.street || !address.number || !address.neighborhood) {
      return { error: "Preencha rua, numero e bairro para entrega." };
    }
  }

  const normalizedItems = [];
  let subtotal = 0;

  for (const cartItem of items) {
    const menuItem = menuIndex.get(cartItem.id);
    const quantity = Number(cartItem.quantity);
    if (!menuItem || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return { error: "Ha itens invalidos no carrinho." };
    }

    const total = Number(menuItem.price) * quantity;
    subtotal += total;
    normalizedItems.push({
      id: menuItem.id,
      name: menuItem.name,
      price: Number(menuItem.price),
      quantity,
      total: Number(total.toFixed(2))
    });
  }

  if (subtotal < Number(store.business.minimumOrder || 0)) {
    return {
      error: `O pedido minimo atual e ${currency(store.business.minimumOrder)}.`
    };
  }

  const deliveryFee = serviceType === "delivery" ? Number(store.business.deliveryFee || 0) : 0;
  const total = Number((subtotal + deliveryFee).toFixed(2));
  const estimatedMinutes =
    serviceType === "delivery"
      ? Number(store.business.deliveryEtaMinutes || 45)
      : Number(store.business.pickupEtaMinutes || 25);

  const notes = String(payload.notes || "").trim();
  const changeFor = paymentMethod === "cash" ? Number(payload.changeFor || 0) : 0;

  return {
    value: {
      customer: {
        name: customerName,
        phone: customerPhone,
        serviceType,
        address: serviceType === "delivery" ? address : null,
        paymentMethod,
        changeFor: changeFor > 0 ? Number(changeFor.toFixed(2)) : null,
        notes
      },
      items: normalizedItems,
      totals: {
        subtotal: Number(subtotal.toFixed(2)),
        deliveryFee,
        total
      },
      estimatedMinutes
    }
  };
}

function getStatusCopy(status, order) {
  if (status === "ready") {
    return {
      label: "Pedido pronto",
      description: order ? getReadyDescription(order) : "O pedido foi finalizado pela loja."
    };
  }

  if (status === "confirmed") {
    return {
      label: "Confirmado",
      description: "Pedido aprovado pela proprietaria e em preparacao."
    };
  }

  if (status === "rejected") {
    return {
      label: "Recusado",
      description: "A proprietaria recusou o pedido. Veja o motivo informado."
    };
  }

  return {
    label: "Aguardando confirmacao",
    description: "Pedido recebido e pendente de aprovacao da loja."
  };
}

function ownerOrAdminCanAccess(req, order, token) {
  if (hasAdminSession(req)) {
    return true;
  }

  return token && token === order.ownerToken;
}

function customerCanAccess(order, token) {
  return token && token === order.customerToken;
}

function getReadyDescription(order) {
  return order.customer.serviceType === "pickup"
    ? "Pedido pronto para retirada no local."
    : "Pedido pronto e aguardando envio para entrega.";
}

async function handleCreateOrder(req, res, store) {
  const payload = await parseBody(req);
  const result = validateOrderPayload(payload, store);
  if (result.error) {
    badRequest(res, result.error);
    return;
  }

  const orders = await loadOrders();
  const existingIds = new Set(orders.map((order) => order.id));
  const now = new Date().toISOString();
  const orderId = createOrderId(existingIds);
  const customerToken = createToken(10);
  const ownerToken = createToken(12);
  const order = {
    id: orderId,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    decision: null,
    customerToken,
    ownerToken,
    customer: result.value.customer,
    items: result.value.items,
    totals: result.value.totals,
    estimatedMinutes: result.value.estimatedMinutes,
    timeline: [
      {
        status: "pending",
        label: "Pedido criado",
        description: "Aguardando a confirmacao da proprietaria.",
        at: now
      }
    ]
  };

  orders.unshift(order);
  await saveOrders(orders);

  const baseUrl = getBaseUrl(req, store);
  const whatsappMessage = buildWhatsAppMessage(order, store, baseUrl);
  const whatsappLinks = buildWhatsAppLinks(store.business.whatsapp, whatsappMessage);

  sendJson(res, 201, {
    order: buildOrderResponse(order),
    trackingUrl: `${baseUrl}/pedido.html?id=${encodeURIComponent(order.id)}&token=${encodeURIComponent(
      order.customerToken
    )}`,
    whatsappUrl: whatsappLinks.appUrl,
    whatsappWebUrl: whatsappLinks.webUrl,
    messagePreview: whatsappMessage
  });
}

async function handleGetOrder(req, res, orderId, token) {
  const orders = await loadOrders();
  const order = orders.find((entry) => entry.id === orderId);
  if (!order) {
    notFound(res);
    return;
  }

  const ownerAccess = ownerOrAdminCanAccess(req, order, token);
  const customerAccess = customerCanAccess(order, token);

  if (!ownerAccess && !customerAccess) {
    unauthorized(res, "Token invalido para este pedido.");
    return;
  }

  const statusCopy = getStatusCopy(order.status, order);
  const payload = {
    order: {
      ...buildOrderResponse(order),
      statusCopy
    },
    audience: ownerAccess ? "owner" : "customer"
  };

  sendJson(res, 200, payload);
}

async function updateOrderDecision(req, res, orderId, type, store, baseUrl) {
  const body = await parseBody(req);
  const orders = await loadOrders();
  const order = orders.find((entry) => entry.id === orderId);

  if (!order) {
    notFound(res);
    return;
  }

  const token = String(body.token || "");
  if (!ownerOrAdminCanAccess(req, order, token)) {
    unauthorized(res, "Somente a proprietaria pode alterar este pedido.");
    return;
  }

  const statusRules = {
    confirm: {
      expectedStatus: "pending",
      nextStatus: "confirmed",
      label: "Pedido confirmado",
      description: "A proprietaria confirmou o pedido e iniciou o preparo."
    },
    reject: {
      expectedStatus: "pending",
      nextStatus: "rejected",
      label: "Pedido recusado",
      description: null
    },
    ready: {
      expectedStatus: "confirmed",
      nextStatus: "ready",
      label: "Pedido pronto",
      description: getReadyDescription(order)
    }
  };

  const rule = statusRules[type];
  if (!rule) {
    badRequest(res, "Acao de pedido invalida.");
    return;
  }

  if (order.status !== rule.expectedStatus) {
    conflict(res, "Este pedido nao pode receber essa atualizacao agora.");
    return;
  }

  const now = new Date().toISOString();
  const reason = String(body.reason || "").trim();
  order.status = rule.nextStatus;
  order.updatedAt = now;
  order.decision = type === "reject" ? reason || "Sem motivo informado." : null;
  order.timeline.push({
    status: order.status,
    label: rule.label,
    description: type === "reject" ? order.decision : rule.description,
    at: now
  });

  await saveOrders(orders);
  const customerWhatsAppMessage = buildCustomerStatusMessage(order, store, baseUrl, type);
  const customerWhatsAppLinks = buildWhatsAppLinks(order.customer.phone, customerWhatsAppMessage);

  sendJson(res, 200, {
    order: {
      ...buildOrderResponse(order),
      statusCopy: getStatusCopy(order.status, order)
    },
    customerWhatsAppUrl: customerWhatsAppLinks.appUrl,
    customerWhatsAppWebUrl: customerWhatsAppLinks.webUrl,
    customerWhatsAppMessage
  });
}

async function handleAdminLogin(req, res, store) {
  const body = await parseBody(req);
  const pin = String(body.pin || "").trim();
  if (!pin || pin !== String(store.owner.adminPin || "")) {
    unauthorized(res, "PIN administrativo invalido.");
    return;
  }

  const sessionToken = createAdminSession();
  sendJson(res, 200, { sessionToken, expiresInHours: 12 });
}

async function handleAdminOrders(req, res) {
  if (!hasAdminSession(req)) {
    unauthorized(res);
    return;
  }

  const orders = await loadOrders();
  sendJson(res, 200, {
    orders: orders.map((order) => ({
      ...buildOrderResponse(order),
      statusCopy: getStatusCopy(order.status, order)
    }))
  });
}

async function handleApi(req, res, url) {
  const store = await loadStore();

  if (req.method === "GET" && url.pathname === "/api/store") {
    sendJson(res, 200, sanitizeStore(store));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/orders") {
    await handleCreateOrder(req, res, store);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    await handleAdminLogin(req, res, store);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/orders") {
    await handleAdminOrders(req, res);
    return;
  }

  const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (req.method === "GET" && orderMatch) {
    await handleGetOrder(req, res, decodeURIComponent(orderMatch[1]), url.searchParams.get("token"));
    return;
  }

  const orderActionMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/(confirm|reject|ready)$/);
  if (req.method === "POST" && orderActionMatch) {
    await updateOrderDecision(
      req,
      res,
      decodeURIComponent(orderActionMatch[1]),
      orderActionMatch[2],
      store,
      getBaseUrl(req, store)
    );
    return;
  }

  notFound(res);
}

async function serveStatic(req, res, url) {
  const cleanPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(cleanPath)));

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Acesso negado.");
    return;
  }

  try {
    const stats = await fs.stat(resolvedPath);
    const filePath = stats.isDirectory() ? path.join(resolvedPath, "index.html") : resolvedPath;
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-cache"
    });
    res.end(body);
  } catch {
    sendText(res, 404, "Arquivo nao encontrado.");
  }
}

async function start() {
  await ensureDataFiles();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        return;
      }

      await serveStatic(req, res, url);
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: "Erro interno no servidor." });
    }
  });

  server.listen(PORT, () => {
    console.log(`Servidor em http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
