import express from "express";
import crypto from "node:crypto";
import { ORDER_STATUSES, addMessage, restockOrder, pauseAiFor } from "./db.js";
import { hashPassword, verifyPassword, makeSessionCookie, readSession, cookieOptions } from "./auth.js";
import { handleIncoming } from "./bot.js";
import { normalizePhone, rupiah, sendWhatsApp, fonnteDevices, explainFonnteError } from "./fonnte.js";
import * as V from "./views.js";

const STATUS_MESSAGES = {
  dibayar: (o, s) => `Terima kasih kak ${o.customer_name} 🙏 Pembayaran pesanan *${o.code}* (${rupiah(o.total)}) sudah kami terima dan segera diproses.`,
  dikirim: (o, s, info) => `Pesanan *${o.code}* sudah dikirim 🚚${info ? `\n${info}` : ""}`,
  selesai: (o) => `Pesanan *${o.code}* selesai. Terima kasih sudah belanja di ${o.store} 😊`,
  batal: (o, s, info) => `Pesanan *${o.code}* dibatalkan.${info ? `\nKeterangan: ${info}` : ""}`,
};

export const isSuperAdmin = (tenant) =>
  !!tenant &&
  (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(tenant.email);

export function createApp(db, deps = {}) {
  const send = deps.send || sendWhatsApp;
  const fonnte = deps.fonnte || fonnteDevices;
  const accountToken = () => deps.accountToken ?? process.env.FONNTE_ACCOUNT_TOKEN ?? "";
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  const baseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;

  // ---------- Fonnte webhooks (public) ----------
  // Device connection events (webhookconnect): { device, status: connect|disconnect, timestamp, reason }
  app.post("/webhook/:key/status", (req, res) => {
    const tenant = db.prepare("SELECT * FROM tenants WHERE webhook_key = ?").get(req.params.key);
    if (!tenant) return res.status(404).json({ ok: false });
    const status = String(req.body?.status || "");
    if (status === "connect" || status === "disconnect") {
      db.prepare("UPDATE tenants SET wa_status = ?, wa_status_reason = ?, wa_status_at = datetime('now') WHERE id = ?").run(
        status,
        String(req.body.reason || ""),
        tenant.id
      );
    }
    res.json({ ok: true });
  });

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
    if (req.tenant) req.tenant.is_super = isSuperAdmin(req.tenant);
    next();
  });
  const auth = (req, res, next) => (req.tenant ? next() : res.redirect("/login"));
  const superOnly = (req, res, next) => (req.tenant?.is_super ? next() : res.status(404).send("Not found"));
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
      res.redirect("/pengaturan?ok=Akun dibuat! Isi nomor WhatsApp toko, info toko, dan cara bayar. Tim kami akan menghubungi untuk menyambungkan WA.");
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
    const recent = {
      orders: db.prepare("SELECT code, customer_name, total, status, created_at FROM orders WHERE tenant_id = ? ORDER BY id DESC LIMIT 5").all(t.id),
      chats: db
        .prepare(
          `SELECT c.*, (SELECT content FROM messages m WHERE m.contact_id = c.id ORDER BY id DESC LIMIT 1) AS last_text
             FROM contacts c WHERE c.tenant_id = ? ORDER BY c.needs_attention DESC, c.last_message_at DESC LIMIT 5`
        )
        .all(t.id),
    };
    res.send(V.dashboardPage(t, stats, flash(req), recent));
  });

  // ---------- settings ----------
  app.get("/pengaturan", auth, (req, res) => res.send(V.settingsPage(req.tenant, flash(req))));
  app.post("/pengaturan", auth, (req, res) => {
    const b = req.body;
    db.prepare(
      "UPDATE tenants SET name = ?, wa_number = ?, owner_phone = ?, store_info = ?, payment_info = ?, ai_enabled = ? WHERE id = ?"
    ).run(
      String(b.name || req.tenant.name).trim(),
      req.tenant.fonnte_token ? req.tenant.wa_number : normalizePhone(b.wa_number), // device number is fixed once created
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
    db.prepare(
      "UPDATE contacts SET ai_paused = ?, ai_paused_until = NULL, needs_attention = CASE WHEN ? = 0 THEN 0 ELSE needs_attention END WHERE id = ?"
    ).run(paused, paused, c.id);
    res.redirect(`/percakapan/${c.id}`);
  });

  app.post("/percakapan/:id/balas", auth, async (req, res) => {
    const c = getContact(req);
    const text = String(req.body.message || "").trim();
    if (!c || !text) return res.redirect("/percakapan");
    try {
      await send(req.tenant.fonnte_token, c.phone, text);
      addMessage(db, req.tenant.id, c.id, "admin", text);
      // Admin took over: keep the AI quiet for a while so it doesn't talk over the human.
      db.prepare("UPDATE contacts SET needs_attention = 0 WHERE id = ?").run(c.id);
      if (!c.ai_paused) pauseAiFor(db, c.id, Number(process.env.AI_PAUSE_MINUTES || 60));
      res.redirect(`/percakapan/${c.id}`);
    } catch (e) {
      res.redirect(`/percakapan/${c.id}?ok=${encodeURIComponent(e.message)}`);
    }
  });

  // ---------- WhatsApp connection (Fonnte device API) ----------
  const setStatus = (id, status, reason = "") =>
    db.prepare("UPDATE tenants SET wa_status = ?, wa_status_reason = ?, wa_status_at = datetime('now') WHERE id = ?").run(status, reason, id);

  /** Creates the shop's device in our Fonnte account (if needed) and points its webhooks at us. */
  async function setupDevice(shop, base) {
    if (!shop.wa_number) throw new Error("Isi dulu nomor WhatsApp toko di Pengaturan.");
    const name = (shop.name.trim() + " ").slice(0, 30).trim().padEnd(2, "_");
    let token = shop.fonnte_token;
    if (!token) {
      if (!accountToken()) throw new Error("Sambung otomatis belum diaktifkan. Tim kami akan menyambungkan secara manual.");
      token = (await fonnte.addDevice(accountToken(), { name, device: shop.wa_number })).token;
      db.prepare("UPDATE tenants SET fonnte_token = ?, wa_status = 'disconnect' WHERE id = ?").run(token, shop.id);
    }
    const hook = `${base}/webhook/${shop.webhook_key}`;
    await fonnte.updateDevice(token, { name, device: shop.wa_number, webhook: hook, webhookconnect: `${hook}/status` });
    return token;
  }

  /** Asks Fonnte for the live device status and stores it. */
  async function refreshStatus(shop) {
    const p = await fonnte.profile(shop.fonnte_token);
    setStatus(shop.id, p.device_status === "connect" ? "connect" : "disconnect");
    return p;
  }

  app.get("/whatsapp", auth, (req, res) => res.send(V.whatsappPage(req.tenant, !!accountToken(), flash(req))));

  app.post("/whatsapp/mulai", auth, async (req, res) => {
    let msg;
    try {
      await setupDevice(req.tenant, baseUrl(req));
      msg = "Siap! Scan QR di bawah dari WhatsApp nomor toko.";
    } catch (e) {
      msg = explainFonnteError(e);
    }
    res.redirect(`/whatsapp?ok=${encodeURIComponent(msg)}`);
  });

  app.get("/whatsapp/qr", auth, async (req, res) => {
    const t = req.tenant;
    if (!t.fonnte_token) return res.json({ error: "Klik Sambungkan WhatsApp dulu." });
    const type = req.query.type === "code" ? "code" : "qr";
    try {
      const r = await fonnte.getQr(t.fonnte_token, { type, whatsapp: type === "code" ? t.wa_number : undefined });
      res.json(type === "code" ? { code: r.code || r.url } : { qr: r.url });
    } catch (e) {
      if (/already connect/i.test(String(e.fonnteReason || e.message))) {
        setStatus(t.id, "connect");
        return res.json({ connected: true });
      }
      res.json({ error: explainFonnteError(e) });
    }
  });

  app.get("/whatsapp/status", auth, async (req, res) => {
    if (!req.tenant.fonnte_token) return res.json({ status: "none" });
    try {
      res.json({ status: (await refreshStatus(req.tenant)).device_status });
    } catch (e) {
      res.json({ status: req.tenant.wa_status || "unknown", error: explainFonnteError(e) });
    }
  });

  app.post("/whatsapp/putus", auth, async (req, res) => {
    let msg = "WhatsApp diputus. AI tidak akan membalas sampai disambungkan lagi.";
    try {
      await fonnte.disconnect(req.tenant.fonnte_token);
      setStatus(req.tenant.id, "disconnect", "diputus dari dashboard");
    } catch (e) {
      msg = explainFonnteError(e);
    }
    res.redirect(`/whatsapp?ok=${encodeURIComponent(msg)}`);
  });

  // ---------- platform admin (SUPERADMIN_EMAILS) ----------
  app.get("/admin", auth, superOnly, (req, res) => {
    const shops = db
      .prepare(
        `SELECT t.*,
           (SELECT count(*) FROM orders o WHERE o.tenant_id = t.id AND o.created_at >= datetime('now','-30 days')) AS orders30,
           (SELECT count(*) FROM messages m WHERE m.tenant_id = t.id AND m.role = 'assistant' AND m.created_at >= datetime('now','-30 days')) AS ai30,
           (SELECT max(created_at) FROM messages m WHERE m.tenant_id = t.id AND m.role = 'user') AS last_in
         FROM tenants t ORDER BY (t.fonnte_token = '') DESC, t.id DESC`
      )
      .all()
      .filter((t) => !isSuperAdmin(t)); // platform admin accounts are not shops
    res.send(V.adminShopsPage(req.tenant, shops, flash(req)));
  });

  const getShop = (req) => db.prepare("SELECT * FROM tenants WHERE id = ?").get(req.params.id);

  app.get("/admin/toko/:id", auth, superOnly, async (req, res) => {
    const shop = getShop(req);
    if (!shop) return res.redirect("/admin");
    let device = null;
    if (shop.fonnte_token) {
      try {
        device = await refreshStatus(shop);
      } catch (e) {
        device = { error: explainFonnteError(e) };
      }
    }
    res.send(V.adminShopPage(req.tenant, shop, `${baseUrl(req)}/webhook/${shop.webhook_key}`, device, !!accountToken(), flash(req)));
  });

  app.post("/admin/toko/:id", auth, superOnly, (req, res) => {
    const shop = getShop(req);
    if (!shop) return res.redirect("/admin");
    const b = req.body;
    const token = b.clear_token ? "" : String(b.fonnte_token || "").trim() || shop.fonnte_token; // blank = keep
    db.prepare("UPDATE tenants SET wa_number = ?, fonnte_token = ?, active = ? WHERE id = ?").run(
      normalizePhone(b.wa_number),
      token,
      b.active ? 1 : 0,
      shop.id
    );
    res.redirect(`/admin/toko/${shop.id}?ok=Tersimpan`);
  });

  app.post("/admin/toko/:id/setup", auth, superOnly, async (req, res) => {
    const shop = getShop(req);
    if (!shop) return res.redirect("/admin");
    let msg = "Device dibuat & webhook diatur. Minta pemilik membuka menu WhatsApp di dashboard untuk scan QR.";
    try {
      await setupDevice(shop, baseUrl(req));
    } catch (e) {
      msg = `Gagal: ${explainFonnteError(e)}`;
    }
    res.redirect(`/admin/toko/${shop.id}?ok=${encodeURIComponent(msg)}`);
  });

  app.post("/admin/toko/:id/tes", auth, superOnly, async (req, res) => {
    const shop = getShop(req);
    if (!shop) return res.redirect("/admin");
    const target = shop.owner_phone || normalizePhone(req.body.target);
    let msg;
    try {
      if (!target) throw new Error("Nomor pemilik toko belum diisi.");
      await send(shop.fonnte_token, target, `✅ Tes koneksi WA Admin AI untuk ${shop.name} berhasil.`);
      msg = `Pesan tes terkirim ke ${target}`;
    } catch (e) {
      msg = `Gagal: ${e.message}`;
    }
    res.redirect(`/admin/toko/${shop.id}?ok=${encodeURIComponent(msg)}`);
  });

  return app;
}
