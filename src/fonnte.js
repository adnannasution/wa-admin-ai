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
  return { phone: normalizePhone(sender), name: String(body.name || "").trim(), text };
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
