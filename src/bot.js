import { addMessage, upsertContact, isAiPaused } from "./db.js";
import { generateReply } from "./ai.js";
import { normalizePhone, parseIncoming, sendWhatsApp } from "./fonnte.js";

// One reply at a time per contact, so bursts of messages are answered in order.
const queues = new Map();
function enqueue(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn).finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  queues.set(key, next);
  return next;
}

export const OWNER_HELP = `Perintah pemilik toko (kirim dari nomor pemilik ke nomor toko):
#stop 0812xxxx  → AI berhenti membalas pelanggan itu
#start 0812xxxx → AI aktif lagi untuk pelanggan itu
#stop semua     → matikan AI untuk semua chat
#start semua    → nyalakan AI lagi
#status         → lihat status AI`;

/**
 * Handles a message sent by the shop owner's own number to the shop number.
 * Owners are never answered as customers. Returns the text to reply.
 */
function handleOwnerCommand(db, tenant, text) {
  const [cmd, arg = ""] = text.trim().split(/\s+/, 2);
  const c = cmd.toLowerCase();
  if (c !== "#stop" && c !== "#start" && c !== "#status") return OWNER_HELP;

  if (c === "#status") {
    const paused = db.prepare("SELECT count(*) n FROM contacts WHERE tenant_id = ? AND ai_paused = 1").get(tenant.id).n;
    return `AI toko: ${tenant.ai_enabled ? "AKTIF ✅" : "MATI ⛔"}\nChat yang dijeda: ${paused}`;
  }
  const on = c === "#start";
  if (arg.toLowerCase() === "semua") {
    db.prepare("UPDATE tenants SET ai_enabled = ? WHERE id = ?").run(on ? 1 : 0, tenant.id);
    return on ? "✅ AI dinyalakan untuk semua chat." : "⛔ AI dimatikan untuk semua chat. Ketik #start semua untuk menyalakan lagi.";
  }
  const phone = normalizePhone(arg);
  if (!phone) return `Nomor belum diisi.\n\n${OWNER_HELP}`;
  const r = db
    .prepare(
      `UPDATE contacts SET ai_paused = ?, ai_paused_until = NULL,
         needs_attention = CASE WHEN ? = 1 THEN 0 ELSE needs_attention END
       WHERE tenant_id = ? AND phone = ?`
    )
    .run(on ? 0 : 1, on ? 1 : 0, tenant.id, phone);
  if (!r.changes) return `Nomor ${phone} belum pernah chat ke toko.`;
  return on ? `✅ AI aktif lagi untuk ${phone}.` : `⏸️ AI berhenti membalas ${phone}. Silakan balas manual dari HP.`;
}

export async function handleIncoming(db, tenant, body, deps = {}) {
  if (!tenant.active) return { skipped: true, reason: "tenant-inactive" };
  const msg = parseIncoming(body);
  if (!msg) return { skipped: true };
  const send = deps.send || sendWhatsApp;

  // The shop's own number (e.g. a self-message) is never treated as a customer.
  if (tenant.wa_number && msg.phone === tenant.wa_number) return { skipped: true, reason: "self" };

  if (tenant.owner_phone && msg.phone === tenant.owner_phone) {
    const reply = handleOwnerCommand(db, tenant, msg.text);
    await send(tenant.fonnte_token, msg.phone, reply).catch((e) => console.error("Balasan owner gagal:", e.message));
    return { owner: true, text: reply };
  }

  const contact = upsertContact(db, tenant.id, msg.phone, msg.name);
  addMessage(db, tenant.id, contact.id, "user", msg.text);
  const myId = db.prepare("SELECT max(id) AS id FROM messages WHERE contact_id = ?").get(contact.id).id;

  return enqueue(`${tenant.id}:${contact.id}`, async () => {
    const fresh = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contact.id);
    const t = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenant.id); // pick up #stop semua etc.
    if (!t.ai_enabled || isAiPaused(fresh)) return { skipped: true, reason: "ai-off" };

    // If the customer sent another message meanwhile, let that message's turn answer both.
    const newer = db
      .prepare("SELECT 1 FROM messages WHERE contact_id = ? AND role = 'user' AND id > ? LIMIT 1")
      .get(contact.id, myId);
    if (newer) return { skipped: true, reason: "newer-message" };

    let result;
    try {
      result = await generateReply(db, t, fresh, deps);
    } catch (e) {
      console.error("AI error:", e);
      result = { text: "", handoff: `Error AI: ${e.message}`, ordersCreated: [] };
    }

    if (result.text) {
      addMessage(db, t.id, contact.id, "assistant", result.text);
      await send(t.fonnte_token, msg.phone, result.text);
    }

    if (result.handoff) {
      db.prepare("UPDATE contacts SET ai_paused = 1, needs_attention = 1 WHERE id = ?").run(contact.id);
      if (t.owner_phone) {
        await send(
          t.fonnte_token,
          t.owner_phone,
          `🔔 Perlu admin: ${fresh.name || msg.phone} (${msg.phone})\nAlasan: ${result.handoff}\n` +
            `AI dijeda untuk kontak ini. Balas pelanggan dari HP, lalu ketik "#start ${msg.phone}" untuk menyalakan AI lagi.`
        ).catch((e) => console.error("Notif owner gagal:", e.message));
      }
    }
    for (const code of result.ordersCreated) {
      if (t.owner_phone) {
        await send(t.fonnte_token, t.owner_phone, `🛒 Pesanan baru ${code} dari ${fresh.name || msg.phone}`).catch(() => {});
      }
    }
    return result;
  });
}
