// Fonnte API client: https://docs.fonnte.com
const FONNTE_SEND_URL = "https://api.fonnte.com/send";

export function rupiah(n) {
  return "Rp" + Number(n).toLocaleString("id-ID");
}

/** Normalise 08xx / +628xx / 628xx into 628xx. */
export function normalizePhone(raw) {
  let p = String(raw || "").replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  return p;
}

/**
 * Extracts what we need from a Fonnte webhook body. Returns null for
 * messages we should not answer (groups, empty text, status callbacks).
 */
export function parseIncoming(body) {
  if (!body || typeof body !== "object") return null;
  const sender = String(body.sender || "");
  const text = String(body.message ?? body.text ?? "").trim();
  if (!sender || !text) return null;
  if (sender.includes("@g.us") || (body.member && String(body.member).length > 0)) return null; // group chat
  // WhatsApp is rolling out "@lid" ids instead of phone numbers; keep those verbatim.
  const phone = sender.includes("@") ? sender : normalizePhone(sender);
  return { phone, name: String(body.name || "").trim(), text };
}

// ---------- Device management API (https://docs.fonnte.com/category/device-api/) ----------
// add-device / get-devices use the ACCOUNT token; qr / update-device / device / disconnect use the DEVICE token.

async function fonntePost(path, token, params = {}) {
  if (!token) throw new Error("Token Fonnte belum diatur.");
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
  const res = await fetch(`https://api.fonnte.com/${path}`, { method: "POST", headers: { Authorization: token }, body });
  const data = await res.json().catch(() => ({ status: false, reason: `HTTP ${res.status}` }));
  if (data.status === false) {
    const err = new Error(data.reason || data.detail || "Permintaan ke Fonnte gagal");
    err.fonnteReason = data.reason || data.detail;
    throw err;
  }
  return data;
}

export const fonnteDevices = {
  /** Creates a device in our Fonnte account; returns { token, ... }. */
  addDevice: (accountToken, { name, device }) =>
    fonntePost("add-device", accountToken, { name, device, autoread: true, personal: true, group: false }),
  /** Webhook only works with autoread ON (docs: webhook-url). */
  updateDevice: (deviceToken, { name, device, webhook, webhookconnect }) =>
    fonntePost("update-device", deviceToken, { name, device, webhook, webhookconnect, autoread: true, personal: true, group: false }),
  /** type "qr" → { url: <base64 png> }; type "code" → { code } (pairing code for the same phone). */
  getQr: (deviceToken, { type = "qr", whatsapp } = {}) => fonntePost("qr", deviceToken, { type, whatsapp }),
  profile: (deviceToken) => fonntePost("device", deviceToken),
  disconnect: (deviceToken) => fonntePost("disconnect", deviceToken),
};

/** Translates Fonnte error reasons into something a shop owner/admin understands. */
export function explainFonnteError(e) {
  const r = String(e.fonnteReason || e.message || "");
  if (/device already connect/i.test(r)) return "WhatsApp sudah tersambung.";
  if (/too much free device/i.test(r)) return "Kuota device gratis Fonnte platform penuh. Admin perlu membeli paket device dulu.";
  if (/device already exist/i.test(r)) return "Nomor ini sudah terdaftar di Fonnte (mungkin di akun lain). Hubungi admin.";
  if (/unknown user|token invalid|device not found|invalid device/i.test(r)) return "Token Fonnte tidak valid. Hubungi admin.";
  if (/input invalid/i.test(r)) return "Data device tidak valid (cek nama toko & nomor WA).";
  return r;
}

export async function sendWhatsApp(token, target, message) {
  if (!token) throw new Error("Token Fonnte belum diisi di Pengaturan.");
  if (process.env.FONNTE_DRY_RUN === "1") {
    console.log(`[fonnte dry-run] -> ${target}: ${message}`);
    return { status: true, dryRun: true };
  }
  const res = await fetch(FONNTE_SEND_URL, {
    method: "POST",
    headers: { Authorization: token },
    body: new URLSearchParams({ target, message, countryCode: "62" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) {
    throw new Error(`Fonnte gagal mengirim: ${data.reason || data.detail || res.status}`);
  }
  return data;
}
