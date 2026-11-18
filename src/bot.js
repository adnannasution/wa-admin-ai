import { addMessage, upsertContact } from "./db.js";
import { generateReply } from "./ai.js";
import { parseIncoming, sendWhatsApp } from "./fonnte.js";

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

export async function handleIncoming(db, tenant, body, deps = {}) {
  const msg = parseIncoming(body);
  if (!msg) return { skipped: true };

  const contact = upsertContact(db, tenant.id, msg.phone, msg.name);
  addMessage(db, tenant.id, contact.id, "user", msg.text);
  const myId = db.prepare("SELECT max(id) AS id FROM messages WHERE contact_id = ?").get(contact.id).id;

  return enqueue(`${tenant.id}:${contact.id}`, async () => {
    const fresh = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contact.id);
    if (!tenant.ai_enabled || fresh.ai_paused) return { skipped: true, reason: "ai-off" };

    // If the customer sent another message meanwhile, let that message's turn answer both.
    const newer = db
      .prepare("SELECT 1 FROM messages WHERE contact_id = ? AND role = 'user' AND id > ? LIMIT 1")
      .get(contact.id, myId);
    if (newer) return { skipped: true, reason: "newer-message" };

    const send = deps.send || sendWhatsApp;
    let result;
    try {
      result = await generateReply(db, tenant, fresh, deps);
    } catch (e) {
      console.error("AI error:", e);
      result = { text: "", handoff: `Error AI: ${e.message}`, ordersCreated: [] };
    }

    if (result.text) {
      addMessage(db, tenant.id, contact.id, "assistant", result.text);
      await send(tenant.fonnte_token, msg.phone, result.text);
    }

    if (result.handoff) {
      db.prepare("UPDATE contacts SET ai_paused = 1, needs_attention = 1 WHERE id = ?").run(contact.id);
      if (tenant.owner_phone) {
        await send(
          tenant.fonnte_token,
          tenant.owner_phone,
          `🔔 Perlu admin: ${fresh.name || msg.phone} (${msg.phone})\nAlasan: ${result.handoff}\nAI dijeda untuk kontak ini.`
        ).catch((e) => console.error("Notif owner gagal:", e.message));
      }
    }
    for (const code of result.ordersCreated) {
      if (tenant.owner_phone) {
        await send(tenant.fonnte_token, tenant.owner_phone, `🛒 Pesanan baru ${code} dari ${fresh.name || msg.phone}`).catch(
          () => {}
        );
      }
    }
    return result;
  });
}
