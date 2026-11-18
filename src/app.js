import express from "express";
import crypto from "node:crypto";
import { ORDER_STATUSES, addMessage, restockOrder } from "./db.js";
import { hashPassword, verifyPassword, makeSessionCookie, readSession, cookieOptions } from "./auth.js";
import { handleIncoming } from "./bot.js";
import { normalizePhone, rupiah, sendWhatsApp } from "./fonnte.js";
import * as V from "./views.js";

const STATUS_MESSAGES = {
  dibayar: (o, s) => `Terima kasih kak ${o.customer_name} 🙏 Pembayaran pesanan *${o.code}* (${rupiah(o.total)}) sudah kami terima dan segera diproses.`,
  dikirim: (o, s, info) => `Pesanan *${o.code}* sudah dikirim 🚚${info ? `\n${info}` : ""}`,
  selesai: (o) => `Pesanan *${o.code}* selesai. Terima kasih sudah belanja di ${o.store} 😊`,
  batal: (o, s, info) => `Pesanan *${o.code}* dibatalkan.${info ? `\nKeterangan: ${info}` : ""}`,
};

export function createApp(db, deps = {}) {
  const send = deps.send || sendWhatsApp;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  const baseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;

  // ---------- Fonnte webhook (public) ----------
  app.post("/webhook/:key", (req, res) => {
    const tenant = db.prepare("SELECT * FROM tenants WHERE webhook_key = ?").get(req.params.key);
    if (!tenant) return res.status(404).json({ ok: false });
    res.json({ ok: true }); // answer Fonnte immediately; reply is sent asynchronously
    handleIncoming(db, tenant, req.body, deps).catch((e) => console.error("Webhook error:", e));
  });
  app.get("/webhook/:key", (req, res) => res.send("OK")); // so you can open the URL to test it

  app.get("/health", (req, res) => res.json({ ok: true }));

  // ---------- auth ----------
  app.use((req, res, next) => {
    const id = readSession(req.headers.cookie);
    req.tenant = id ? db.prepare("SELECT * FROM tenants WHERE id = ?").get(id) : null;
    next();
  });
  const auth = (req, res, next) => (req.tenant ? next() : res.redirect("/login"));
  const flash = (req) => (req.query.ok ? String(req.query.ok) : undefined);

  app.get("/", (req, res) => res.redirect(req.tenant ? "/dashboard" : "/login"));
  app.get("/login", (req, res) => res.send(V.authPage("login")));
  app.get("/register", (req, res) => res.send(V.authPage("register")));

  app.post("/register", (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 8)
      return res.status(400).send(V.authPage("register", "Lengkapi data, password minimal 8 karakter."));
    try {
      const r = db
        .prepare("INSERT INTO tenants (name, email, password_hash, webhook_key) VALUES (?, ?, ?, ?)")
        .run(name.trim(), email.trim().toLowerCase(), hashPassword(password), crypto.randomBytes(18).toString("base64url"));
      res.cookie("sid", makeSessionCookie(r.lastInsertRowid), cookieOptions());
      res.redirect("/pengaturan?ok=Akun dibuat. Isi token Fonnte dan info toko dulu ya.");
    } catch {
      res.status(400).send(V.authPage("register", "Email sudah terdaftar."));
    }
  });

  app.post("/login", (req, res) => {
    const t = db.prepare("SELECT * FROM tenants WHERE email = ?").get(String(req.body.email || "").trim().toLowerCase());
    if (!t || !verifyPassword(String(req.body.password || ""), t.password_hash))
      return res.status(401).send(V.authPage("login", "Email atau password salah."));
    res.cookie("sid", makeSessionCookie(t.id), cookieOptions());
    res.redirect("/dashboard");
  });

  app.post("/logout", (req, res) => {
    res.clearCookie("sid");
    res.redirect("/login");
  });

  // ---------- dashboard ----------
  app.get("/dashboard", auth, (req, res) => {
    const t = req.tenant;
    const one = (sql, ...a) => Object.values(db.prepare(sql).get(...a))[0] ?? 0;
    const stats = {
      ordersToday: one("SELECT count(*) FROM orders WHERE tenant_id = ? AND date(created_at) = date('now')", t.id),
      revenue30: one(
        "SELECT COALESCE(sum(total),0) FROM orders WHERE tenant_id = ? AND status IN ('dibayar','dikirim','selesai') AND created_at >= datetime('now','-30 days')",
        t.id
      ),
      unpaid: one("SELECT count(*) FROM orders WHERE tenant_id = ? AND status = 'menunggu_bayar'", t.id),
      attention: one("SELECT count(*) FROM contacts WHERE tenant_id = ? AND needs_attention = 1", t.id),
    };
    res.send(V.dashboardPage(t, stats, `${baseUrl(req)}/webhook/${t.webhook_key}`, flash(req)));
  });

  // ---------- settings ----------
  app.get("/pengaturan", auth, (req, res) => res.send(V.settingsPage(req.tenant, flash(req))));
  app.post("/pengaturan", auth, (req, res) => {
    const b = req.body;
    db.prepare(
      "UPDATE tenants SET name = ?, fonnte_token = ?, owner_phone = ?, store_info = ?, payment_info = ?, ai_enabled = ? WHERE id = ?"
    ).run(
      String(b.name || req.tenant.name).trim(),
      String(b.fonnte_token || "").trim(),
      normalizePhone(b.owner_phone),
      String(b.store_info || ""),
      String(b.payment_info || ""),
      b.ai_enabled ? 1 : 0,
      req.tenant.id
    );
    res.redirect("/pengaturan?ok=Tersimpan");
  });

  // ---------- products ----------
  const productFields = (b) => [
    String(b.name || "").trim(),
    Math.max(0, parseInt(b.price, 10) || 0),
    b.stock === "" || b.stock === undefined ? null : Math.max(0, parseInt(b.stock, 10) || 0),
    String(b.description || "").trim(),
  ];
  app.get("/produk", auth, (req, res) => {
    const products = db.prepare("SELECT * FROM products WHERE tenant_id = ? ORDER BY active DESC, name").all(req.tenant.id);
    res.send(V.productsPage(req.tenant, products, flash(req)));
  });
  app.post("/produk", auth, (req, res) => {
    const f = productFields(req.body);
    if (!f[0]) return res.redirect("/produk?ok=Nama produk wajib diisi");
    db.prepare("INSERT INTO products (tenant_id, name, price, stock, description) VALUES (?, ?, ?, ?, ?)").run(req.tenant.id, ...f);
    res.redirect("/produk?ok=Produk ditambahkan");
  });
  app.get("/produk/:id", auth, (req, res) => {
    const p = db.prepare("SELECT * FROM products WHERE id = ? AND tenant_id = ?").get(req.params.id, req.tenant.id);
    if (!p) return res.redirect("/produk");
    res.send(V.productEditPage(req.tenant, p));
  });
  app.post("/produk/:id", auth, (req, res) => {
    db.prepare("UPDATE products SET name = ?, price = ?, stock = ?, description = ?, active = ? WHERE id = ? AND tenant_id = ?").run(
      ...productFields(req.body),
      req.body.active ? 1 : 0,
      req.params.id,
      req.tenant.id
    );
    res.redirect("/produk?ok=Produk diperbarui");
  });

  // ---------- orders ----------
  const listOrders = (tenantId, status) =>
    db
      .prepare(
        `SELECT o.*, c.phone FROM orders o JOIN contacts c ON c.id = o.contact_id
          WHERE o.tenant_id = ? ${status ? "AND o.status = ?" : ""} ORDER BY o.id DESC LIMIT 500`
      )
      .all(...(status ? [tenantId, status] : [tenantId]));
  const validStatus = (s) => (s && ORDER_STATUSES[s] ? s : "");

  app.get("/pesanan", auth, (req, res) => {
    const status = validStatus(req.query.status);
    res.send(V.ordersPage(req.tenant, listOrders(req.tenant.id, status), status, flash(req)));
  });

  app.get("/pesanan.csv", auth, (req, res) => {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = listOrders(req.tenant.id, validStatus(req.query.status)).map((o) =>
      [
        o.code,
        o.created_at,
        o.customer_name,
        o.phone,
        o.address,
        JSON.parse(o.items_json)
          .map((l) => `${l.qty}x ${l.name}`)
          .join("; "),
        o.total,
        ORDER_STATUSES[o.status],
        o.note,
      ]
        .map(q)
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="pesanan.csv"`);
    res.send("﻿kode,tanggal,nama,telepon,alamat,item,total,status,catatan\n" + rows.join("\n"));
  });

  app.post("/pesanan/:id/status", auth, async (req, res) => {
    const status = validStatus(req.body.status);
    const o = db
      .prepare(
        `SELECT o.*, c.phone, t.name AS store FROM orders o JOIN contacts c ON c.id = o.contact_id JOIN tenants t ON t.id = o.tenant_id
          WHERE o.id = ? AND o.tenant_id = ?`
      )
      .get(req.params.id, req.tenant.id);
    if (!o || !status) return res.redirect("/pesanan");
    if (status !== o.status) {
      if (status === "batal") restockOrder(db, o);
      db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, o.id);
    }
    let msg = "Status diperbarui";
    const make = STATUS_MESSAGES[status];
    if (req.body.notify && make && status !== o.status) {
      const text = make(o, status, String(req.body.info || "").trim());
      try {
        await send(req.tenant.fonnte_token, o.phone, text);
        addMessage(db, req.tenant.id, o.contact_id, "admin", text);
        msg += " & pelanggan dikabari";
      } catch (e) {
        msg += `, tapi WA gagal: ${e.message}`;
      }
    }
    res.redirect(`/pesanan?ok=${encodeURIComponent(msg)}`);
  });

  // ---------- conversations ----------
  app.get("/percakapan", auth, (req, res) => {
    const contacts = db
      .prepare(
        `SELECT c.*, (SELECT content FROM messages m WHERE m.contact_id = c.id ORDER BY id DESC LIMIT 1) AS last_text
           FROM contacts c WHERE c.tenant_id = ? ORDER BY c.needs_attention DESC, c.last_message_at DESC LIMIT 200`
      )
      .all(req.tenant.id);
    res.send(V.contactsPage(req.tenant, contacts));
  });

  const getContact = (req) => db.prepare("SELECT * FROM contacts WHERE id = ? AND tenant_id = ?").get(req.params.id, req.tenant.id);

  app.get("/percakapan/:id", auth, (req, res) => {
    const c = getContact(req);
    if (!c) return res.redirect("/percakapan");
    const msgs = db.prepare("SELECT * FROM messages WHERE contact_id = ? ORDER BY id DESC LIMIT 100").all(c.id).reverse();
    res.send(V.conversationPage(req.tenant, c, msgs, flash(req)));
  });

  app.post("/percakapan/:id/ai", auth, (req, res) => {
    const c = getContact(req);
    if (!c) return res.redirect("/percakapan");
    const paused = req.body.paused === "1" ? 1 : 0;
    db.prepare("UPDATE contacts SET ai_paused = ?, needs_attention = CASE WHEN ? = 0 THEN 0 ELSE needs_attention END WHERE id = ?").run(
      paused,
      paused,
      c.id
    );
    res.redirect(`/percakapan/${c.id}`);
  });

  app.post("/percakapan/:id/balas", auth, async (req, res) => {
    const c = getContact(req);
    const text = String(req.body.message || "").trim();
    if (!c || !text) return res.redirect("/percakapan");
    try {
      await send(req.tenant.fonnte_token, c.phone, text);
      addMessage(db, req.tenant.id, c.id, "admin", text);
      db.prepare("UPDATE contacts SET ai_paused = 1, needs_attention = 0 WHERE id = ?").run(c.id);
      res.redirect(`/percakapan/${c.id}`);
    } catch (e) {
      res.redirect(`/percakapan/${c.id}?ok=${encodeURIComponent(e.message)}`);
    }
  });

  return app;
}
