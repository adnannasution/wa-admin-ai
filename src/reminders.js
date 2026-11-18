import { sendWhatsApp, rupiah } from "./fonnte.js";
import { addMessage } from "./db.js";


/** Sends payment reminders for unpaid orders. Returns how many were sent. */
export async function sendPaymentReminders(db, { send = sendWhatsApp } = {}) {
  const HOURS = Number(process.env.REMINDER_HOURS || 6);
  const MAX = Number(process.env.REMINDER_MAX || 2);
  const due = db
    .prepare(
      `SELECT o.*, c.phone, t.fonnte_token, t.payment_info, t.name AS store
         FROM orders o JOIN contacts c ON c.id = o.contact_id JOIN tenants t ON t.id = o.tenant_id
        WHERE o.status = 'menunggu_bayar' AND o.reminders_sent < ? AND t.fonnte_token <> ''
          AND datetime(COALESCE(o.last_reminder_at, o.created_at), '+' || ? || ' hours') <= datetime('now')`
    )
    .all(MAX, HOURS);

  let sent = 0;
  for (const o of due) {
    const text =
      `Halo kak ${o.customer_name}, pengingat dari *${o.store}* 🙏\n` +
      `Pesanan *${o.code}* sebesar *${rupiah(o.total)}* masih menunggu pembayaran.\n\n` +
      `${o.payment_info || ""}\n\nKalau sudah transfer, balas chat ini dengan bukti bayar ya kak.`;
    try {
      await send(o.fonnte_token, o.phone, text.trim());
      addMessage(db, o.tenant_id, o.contact_id, "assistant", text.trim());
      db.prepare("UPDATE orders SET reminders_sent = reminders_sent + 1, last_reminder_at = datetime('now') WHERE id = ?").run(o.id);
      sent++;
    } catch (e) {
      console.error(`Reminder ${o.code} gagal:`, e.message);
    }
  }
  return sent;
}
