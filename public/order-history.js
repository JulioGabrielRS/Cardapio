(function attachOrderHistoryApi() {
  const HISTORY_KEY = "kaori-order-history";
  const LAST_KEY = "kaori-last-order";
  const MAX_ENTRIES = 8;

  function buildTrackingUrl(id, token) {
    return `${window.location.origin}/pedido.html?id=${encodeURIComponent(id)}&token=${encodeURIComponent(
      token
    )}`;
  }

  function parseJson(value) {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function normalize(entry) {
    if (!entry || !entry.id || !entry.token) {
      return null;
    }

    return {
      id: String(entry.id),
      token: String(entry.token),
      trackingUrl: entry.trackingUrl || buildTrackingUrl(entry.id, entry.token),
      createdAt: entry.createdAt || null,
      total: typeof entry.total === "number" ? entry.total : Number(entry.total || 0),
      status: entry.status || null,
      statusLabel: entry.statusLabel || null
    };
  }

  function persist(entries) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));

    if (entries[0]) {
      localStorage.setItem(LAST_KEY, JSON.stringify(entries[0]));
      return;
    }

    localStorage.removeItem(LAST_KEY);
  }

  function loadHistory() {
    const parsedHistory = parseJson(localStorage.getItem(HISTORY_KEY));
    if (Array.isArray(parsedHistory)) {
      return parsedHistory.map(normalize).filter(Boolean);
    }

    const parsedLast = normalize(parseJson(localStorage.getItem(LAST_KEY)));
    return parsedLast ? [parsedLast] : [];
  }

  function saveOrder(entry) {
    const normalized = normalize(entry);
    if (!normalized) {
      return loadHistory();
    }

    const history = loadHistory().filter(
      (item) => !(item.id === normalized.id && item.token === normalized.token)
    );
    history.unshift(normalized);
    const trimmed = history.slice(0, MAX_ENTRIES);
    persist(trimmed);
    return trimmed;
  }

  function loadLastOrder() {
    return loadHistory()[0] || null;
  }

  function clearHistory() {
    persist([]);
  }

  window.kaoriOrderHistory = {
    buildTrackingUrl,
    loadHistory,
    saveOrder,
    loadLastOrder,
    clearHistory
  };
})();
