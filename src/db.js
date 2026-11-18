import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export function openDb(file = process.env.DATABASE_PATH || "./data/app.db") {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      webhook_key TEXT NOT NULL UNIQUE,
      fonnte_token TEXT NOT NULL DEFAULT '',
      owner_phone TEXT NOT NULL DEFAULT '',
      store_info TEXT NOT NULL DEFAULT '',
      payment_info TEXT NOT NULL DEFAULT '',
      ai_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      stock INTEGER,
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      ai_paused INTEGER NOT NULL DEFAULT 0,
      needs_attention INTEGER NOT NULL DEFAULT 0,
      last_message_at TEXT,
      UNIQUE (tenant_id, phone)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant','admin')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id, id);

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      address TEXT NOT NULL,
      items_json TEXT NOT NULL,
      total INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'menunggu_bayar',
      reminders_sent INTEGER NOT NULL DEFAULT 0,
      last_reminder_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id, status);
  `);
  migrate(db);
  return db;
}

// Additive migrations for databases created by earlier versions.
function migrate(db) {
  const addColumn = (table, column, ddl) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  addColumn("tenants", "wa_number", "wa_number TEXT NOT NULL DEFAULT ''"); // shop's WhatsApp number (Fonnte device)
  addColumn("tenants", "active", "active INTEGER NOT NULL DEFAULT 1"); // 0 = suspended by platform admin
  addColumn("contacts", "ai_paused_until", "ai_paused_until TEXT"); // temporary pause after a human reply
}

/** True when the AI should not answer this contact right now. */
export function isAiPaused(contact) {
  if (contact.ai_paused) return true;
  if (!contact.ai_paused_until) return false;
  return new Date(contact.ai_paused_until.replace(" ", "T") + "Z").getTime() > Date.now();
}

/** Pauses the AI for one contact for `minutes` (temporary, auto-resumes). */
export function pauseAiFor(db, contactId, minutes) {
  db.prepare("UPDATE contacts SET ai_paused_until = datetime('now', '+' || ? || ' minutes') WHERE id = ?").run(
    Number(minutes),
    contactId
  );
}

export const ORDER_STATUSES = {
  menunggu_bayar: "Menunggu pembayaran",
  dibayar: "Dibayar",
  dikirim: "Dikirim",
  selesai: "Selesai",
  batal: "Batal",
};

export function upsertContact(db, tenantId, phone, name) {
  db.prepare(
    `INSERT INTO contacts (tenant_id, phone, name, last_message_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (tenant_id, phone) DO UPDATE SET
       name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE contacts.name END,
       last_message_at = datetime('now')`
  ).run(tenantId, phone, name || "");
  return db.prepare("SELECT * FROM contacts WHERE tenant_id = ? AND phone = ?").get(tenantId, phone);
}

export function addMessage(db, tenantId, contactId, role, content) {
  db.prepare("INSERT INTO messages (tenant_id, contact_id, role, content) VALUES (?, ?, ?, ?)").run(
    tenantId,
    contactId,
    role,
    content
  );
}

export function recentMessages(db, contactId, limit = 20) {
  return db
    .prepare("SELECT role, content, created_at FROM messages WHERE contact_id = ? ORDER BY id DESC LIMIT ?")
    .all(contactId, limit)
    .reverse();
}

export function activeProducts(db, tenantId) {
  return db.prepare("SELECT * FROM products WHERE tenant_id = ? AND active = 1 ORDER BY name").all(tenantId);
}

export function newOrderCode() {
  const d = new Date();
  const ymd = `${d.getFullYear() % 100}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV${ymd}-${rand}`;
}

/**
 * Validates items against the catalog, decrements stock and creates the order
 * in one transaction. Throws an Error with a customer-safe message on failure.
 */
export function createOrder(db, { tenantId, contactId, customerName, address, items, note }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Pesanan belum berisi produk.");
  db.exec("BEGIN");
  try {
    const lines = [];
    let total = 0;
    for (const it of items) {
      const qty = Number(it.jumlah);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Jumlah produk tidak valid.");
      const p = db
        .prepare("SELECT * FROM products WHERE id = ? AND tenant_id = ? AND active = 1")
        .get(Number(it.produk_id), tenantId);
      if (!p) throw new Error(`Produk dengan id ${it.produk_id} tidak ditemukan.`);
      if (p.stock !== null && p.stock < qty) throw new Error(`Stok ${p.name} tinggal ${p.stock}.`);
      if (p.stock !== null) db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(qty, p.id);
      lines.push({ product_id: p.id, name: p.name, price: p.price, qty, subtotal: p.price * qty });
      total += p.price * qty;
    }
    const code = newOrderCode();
    db.prepare(
      `INSERT INTO orders (tenant_id, contact_id, code, customer_name, address, items_json, total, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(tenantId, contactId, code, customerName, address, JSON.stringify(lines), total, note || "");
    db.exec("COMMIT");
    return { code, total, lines };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Returns stock to the catalog when an unpaid/paid order is cancelled. */
export function restockOrder(db, order) {
  for (const l of JSON.parse(order.items_json)) {
    db.prepare("UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL").run(l.qty, l.product_id);
  }
}
