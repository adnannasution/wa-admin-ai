import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, upsertContact, pauseAiFor } from "../src/db.js";
import { waFormat } from "../src/views.js";
import { createApp } from "../src/app.js";
import { handleIncoming } from "../src/bot.js";
import { historyToMessages } from "../src/ai.js";
import { parseIncoming, normalizePhone } from "../src/fonnte.js";
import { sendPaymentReminders } from "../src/reminders.js";

process.env.SESSION_SECRET = "test-secret-1234567890";

function setup() {
  const db = openDb(":memory:");
  db.prepare(
    "INSERT INTO tenants (name, email, password_hash, webhook_key, fonnte_token, owner_phone, payment_info) VALUES ('Toko Kue', 'a@b.c', 'x', 'KEY', 'TOKEN', '6281111', 'BCA 123')"
  ).run();
  db.prepare("INSERT INTO products (tenant_id, name, price, stock) VALUES (1, 'Brownies', 50000, 3)").run();
  const tenant = db.prepare("SELECT * FROM tenants WHERE id = 1").get();
  const sent = [];
  const send = async (token, to, text) => sent.push({ token, to, text });
  return { db, tenant, sent, send };
}

// Fake Claude client that replays scripted responses and records requests.
function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (req) => (calls.push(structuredClone(req)), responses.shift()) } },
  };
}

test("parseIncoming ignores groups and normalises phones", () => {
  assert.equal(parseIncoming({ sender: "120363@g.us", message: "hi" }), null);
  assert.equal(parseIncoming({ sender: "0812", message: "" }), null);
  assert.deepEqual(parseIncoming({ sender: "08123", message: " halo ", name: "Ani" }), { phone: "628123", name: "Ani", text: "halo" });
  assert.equal(normalizePhone("+62 812-3"), "628123");
});

test("historyToMessages merges same-role turns and starts with user", () => {
  const m = historyToMessages([
    { role: "assistant", content: "reminder" },
    { role: "user", content: "a" },
    { role: "user", content: "b" },
    { role: "admin", content: "c" },
  ]);
  assert.deepEqual(m, [
    { role: "user", content: "a\nb" },
    { role: "assistant", content: "c" },
  ]);
});

test("AI creates an order through the tool and replies via Fonnte", async () => {
  const { db, tenant, sent, send } = setup();
  const client = fakeClient([
    {
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "t1", name: "buat_pesanan", input: { nama_pelanggan: "Ani", alamat: "Jl. Mawar 1", items: [{ produk_id: 1, jumlah: 2 }], catatan: "" } },
      ],
    },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Pesanan dibuat kak!" }] },
  ]);
  const r = await handleIncoming(db, tenant, { sender: "08123", name: "Ani", message: "ok setuju" }, { client, send });

  assert.equal(r.ordersCreated.length, 1);
  const order = db.prepare("SELECT * FROM orders").get();
  assert.equal(order.total, 100000);
  assert.equal(db.prepare("SELECT stock FROM products WHERE id = 1").get().stock, 1);
  // tool result went back to the model
  const second = client.calls[1].messages.at(-1).content[0];
  assert.equal(second.type, "tool_result");
  assert.match(second.content, /Rp100\.000/);
  // reply to customer + notification to owner
  assert.deepEqual(sent.map((s) => s.to), ["628123", "6281111"]);
  assert.equal(sent[0].text, "Pesanan dibuat kak!");
});

test("stock check: order fails gracefully and model gets is_error", async () => {
  const { db, tenant, send } = setup();
  const client = fakeClient([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "buat_pesanan", input: { nama_pelanggan: "A", alamat: "B", items: [{ produk_id: 1, jumlah: 9 }], catatan: "" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Maaf stok kurang" }] },
  ]);
  await handleIncoming(db, tenant, { sender: "08123", message: "pesan 9" }, { client, send });
  const tr = client.calls[1].messages.at(-1).content[0];
  assert.equal(tr.is_error, true);
  assert.match(tr.content, /Stok Brownies tinggal 3/);
  assert.equal(db.prepare("SELECT count(*) n FROM orders").get().n, 0);
});

test("handoff pauses AI for the contact and later messages are not answered", async () => {
  const { db, tenant, sent, send } = setup();
  const client = fakeClient([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "panggil_admin", input: { alasan: "komplain" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Admin segera membalas" }] },
  ]);
  await handleIncoming(db, tenant, { sender: "08123", message: "barang rusak!" }, { client, send });
  const c = db.prepare("SELECT * FROM contacts").get();
  assert.equal(c.ai_paused, 1);
  assert.equal(c.needs_attention, 1);
  const r = await handleIncoming(db, tenant, { sender: "08123", message: "halo?" }, { client, send });
  assert.equal(r.reason, "ai-off");
  assert.equal(sent.length, 2); // reply + owner alert only
});

test("payment reminders are sent once due and capped", async () => {
  const { db, sent, send } = setup();
  db.prepare("INSERT INTO contacts (tenant_id, phone) VALUES (1, '628123')").run();
  db.prepare(
    "INSERT INTO orders (tenant_id, contact_id, code, customer_name, address, items_json, total, created_at) VALUES (1, 1, 'INV1', 'Ani', 'x', '[]', 50000, datetime('now','-7 hours'))"
  ).run();
  assert.equal(await sendPaymentReminders(db, { send }), 1);
  assert.match(sent[0].text, /INV1/);
  assert.equal(await sendPaymentReminders(db, { send }), 0); // not due again yet
});

// Fake Fonnte device API that records calls.
function fakeFonnte(overrides = {}) {
  const calls = [];
  const rec = (name, result) => async (...args) => {
    calls.push([name, ...args]);
    const r = typeof result === "function" ? result(...args) : result;
    if (r instanceof Error) throw r;
    return r;
  };
  return {
    calls,
    addDevice: rec("addDevice", overrides.addDevice ?? { status: true, token: "DEV-TOKEN-9" }),
    updateDevice: rec("updateDevice", { status: true }),
    getQr: rec("getQr", overrides.getQr ?? ((tok, o) => (o.type === "code" ? { status: true, code: "ABCD-1234" } : { status: true, url: "iVBORw0KGgo" }))),
    profile: rec("profile", overrides.profile ?? { status: true, device_status: "disconnect", package: "Lite", quota: "1000", expired: "1 Jan 2027" }),
    disconnect: rec("disconnect", { status: true }),
  };
}

async function withServer(db, fn, deps = {}) {
  const app = createApp(db, { send: async () => {}, fonnte: fakeFonnte(), accountToken: "", ...deps });
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

async function register(base, email, name = "Toko Baru") {
  const r = await fetch(`${base}/register`, {
    method: "POST",
    redirect: "manual",
    body: new URLSearchParams({ name, email, password: "rahasia123" }),
  });
  assert.equal(r.status, 302);
  return r.headers.get("set-cookie").split(";")[0];
}

const post = (base, path, cookie, data) =>
  fetch(`${base}${path}`, { method: "POST", redirect: "manual", headers: { cookie }, body: new URLSearchParams(data) });

test("merchant flow: register, product, settings cannot set Fonnte token", async () => {
  const { db } = setup();
  await withServer(db, async (base) => {
    let r = await fetch(`${base}/dashboard`, { redirect: "manual" });
    assert.equal(r.status, 302);
    const cookie = await register(base, "x@y.z");

    r = await post(base, "/produk", cookie, { name: "Kopi", price: "20000", stock: "" });
    assert.equal(db.prepare("SELECT stock FROM products WHERE name = 'Kopi'").get().stock, null);

    await post(base, "/pengaturan", cookie, { name: "Toko Baru", wa_number: "0812555", owner_phone: "0813666", fonnte_token: "HACK" });
    const t = db.prepare("SELECT * FROM tenants WHERE email = 'x@y.z'").get();
    assert.equal(t.wa_number, "62812555");
    assert.equal(t.fonnte_token, ""); // merchants can't set the token

    const html = await (await fetch(`${base}/dashboard`, { headers: { cookie } })).text();
    assert.match(html, /Belum tersambung/);
    assert.doesNotMatch(html, /webhook\//); // webhook URL is admin-only
    assert.equal((await fetch(`${base}/admin`, { headers: { cookie } })).status, 404);

    r = await fetch(`${base}/webhook/WRONG`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(r.status, 404);
  });
});

test("platform admin connects a shop, token kept when blank, can suspend", async () => {
  const { db } = setup();
  process.env.SUPERADMIN_EMAILS = "boss@platform.id";
  await withServer(db, async (base) => {
    const shopCookie = await register(base, "shop@toko.id", "Toko Kopi");
    const boss = await register(base, "boss@platform.id", "Platform");
    const shopId = db.prepare("SELECT id FROM tenants WHERE email = 'shop@toko.id'").get().id;

    const list = await (await fetch(`${base}/admin`, { headers: { cookie: boss } })).text();
    assert.match(list, /Toko Kopi/);
    const page = await (await fetch(`${base}/admin/toko/${shopId}`, { headers: { cookie: boss } })).text();
    assert.match(page, /\/webhook\/[A-Za-z0-9_-]{24}/);

    await post(base, `/admin/toko/${shopId}`, boss, { wa_number: "0812777", fonnte_token: "TOK-1234", active: "1" });
    let t = db.prepare("SELECT * FROM tenants WHERE id = ?").get(shopId);
    assert.equal(t.fonnte_token, "TOK-1234");
    assert.equal(t.wa_number, "62812777");

    await post(base, `/admin/toko/${shopId}`, boss, { wa_number: "0812777", fonnte_token: "" }); // blank keeps token, unchecked = suspend
    t = db.prepare("SELECT * FROM tenants WHERE id = ?").get(shopId);
    assert.equal(t.fonnte_token, "TOK-1234");
    assert.equal(t.active, 0);

    const html = await (await fetch(`${base}/dashboard`, { headers: { cookie: shopCookie } })).text();
    assert.match(html, /sedang nonaktif/);
    assert.match(html, /Belum tersambung/); // token set but device not connected yet
  });
  delete process.env.SUPERADMIN_EMAILS;
});

test("suspended shop: webhook messages are ignored", async () => {
  const { db, tenant, sent, send } = setup();
  const r = await handleIncoming(db, { ...tenant, active: 0 }, { sender: "08123", message: "halo" }, { send });
  assert.equal(r.reason, "tenant-inactive");
  assert.equal(sent.length, 0);
});

test("owner commands #stop/#start control the AI and owner is never answered as a customer", async () => {
  const { db, tenant, sent, send } = setup();
  const client = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "Halo kak" }] }]);
  await handleIncoming(db, tenant, { sender: "08123", message: "halo" }, { client, send });
  assert.equal(sent.at(-1).text, "Halo kak");

  let r = await handleIncoming(db, tenant, { sender: "6281111", message: "#stop 08123" }, { send });
  assert.match(r.text, /berhenti membalas 628123/);
  r = await handleIncoming(db, tenant, { sender: "08123", message: "masih ada?" }, { client, send });
  assert.equal(r.reason, "ai-off");

  r = await handleIncoming(db, tenant, { sender: "6281111", message: "#start 08123" }, { send });
  assert.match(r.text, /aktif lagi/);
  assert.equal(db.prepare("SELECT ai_paused FROM contacts WHERE phone = '628123'").get().ai_paused, 0);

  r = await handleIncoming(db, tenant, { sender: "6281111", message: "#stop semua" }, { send });
  assert.equal(db.prepare("SELECT ai_enabled FROM tenants WHERE id = 1").get().ai_enabled, 0);
  r = await handleIncoming(db, tenant, { sender: "6281111", message: "halo bot" }, { send });
  assert.match(r.text, /Perintah pemilik toko/);
  assert.equal(db.prepare("SELECT count(*) n FROM contacts WHERE phone = '6281111'").get().n, 0);
});

test("admin reply from dashboard pauses AI temporarily, then it resumes", async () => {
  const { db, tenant, send } = setup();
  const c = upsertContact(db, 1, "628123", "Ani");
  pauseAiFor(db, c.id, 60);
  let r = await handleIncoming(db, tenant, { sender: "08123", message: "halo" }, { send });
  assert.equal(r.reason, "ai-off");

  db.prepare("UPDATE contacts SET ai_paused_until = datetime('now', '-1 minutes') WHERE id = ?").run(c.id);
  const client = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "Hai lagi" }] }]);
  r = await handleIncoming(db, tenant, { sender: "08123", message: "halo?" }, { client, send });
  assert.equal(r.text, "Hai lagi");
});

test("waFormat renders WhatsApp bold/italic safely", () => {
  assert.equal(waFormat("*Total* _ok_ <b>"), "<b>Total</b> <i>ok</i> &lt;b&gt;");
});

test("self-service connect: create device, set webhooks, show QR / pairing code, detect connection", async () => {
  const { db } = setup();
  const fonnte = fakeFonnte();
  await withServer(
    db,
    async (base) => {
      const cookie = await register(base, "kopi@toko.id", "Kopi Senja");
      let html = await (await fetch(`${base}/whatsapp`, { headers: { cookie } })).text();
      assert.match(html, /Isi dulu <b>nomor WhatsApp toko/);

      await post(base, "/pengaturan", cookie, { name: "Kopi Senja", wa_number: "0812999", owner_phone: "0813111" });
      html = await (await fetch(`${base}/whatsapp`, { headers: { cookie } })).text();
      assert.match(html, /Sambungkan WhatsApp<\/button>/);

      await post(base, "/whatsapp/mulai", cookie, {});
      const t = db.prepare("SELECT * FROM tenants WHERE email = 'kopi@toko.id'").get();
      assert.equal(t.fonnte_token, "DEV-TOKEN-9");
      const [, acct, addArgs] = fonnte.calls.find((c) => c[0] === "addDevice");
      assert.equal(acct, "ACCT-TOKEN");
      assert.deepEqual(addArgs, { name: "Kopi Senja", device: "62812999" });
      const [, devTok, upd] = fonnte.calls.find((c) => c[0] === "updateDevice");
      assert.equal(devTok, "DEV-TOKEN-9");
      assert.equal(upd.webhook, `${base}/webhook/${t.webhook_key}`);
      assert.equal(upd.webhookconnect, `${base}/webhook/${t.webhook_key}/status`);

      assert.deepEqual(await (await fetch(`${base}/whatsapp/qr`, { headers: { cookie } })).json(), { qr: "iVBORw0KGgo" });
      assert.deepEqual(await (await fetch(`${base}/whatsapp/qr?type=code`, { headers: { cookie } })).json(), { code: "ABCD-1234" });
      assert.equal(fonnte.calls.find((c) => c[0] === "getQr" && c[2].type === "code")[2].whatsapp, "62812999");

      // number is locked once the device exists
      await post(base, "/pengaturan", cookie, { name: "Kopi Senja", wa_number: "0899000", owner_phone: "0813111" });
      assert.equal(db.prepare("SELECT wa_number FROM tenants WHERE id = ?").get(t.id).wa_number, "62812999");

      // Fonnte reports the connection via webhookconnect
      const r = await fetch(`${base}/webhook/${t.webhook_key}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device: "62812999", status: "connect", timestamp: 1 }),
      });
      assert.equal(r.status, 200);
      html = await (await fetch(`${base}/dashboard`, { headers: { cookie } })).text();
      assert.match(html, /WhatsApp tersambung/);
      html = await (await fetch(`${base}/whatsapp`, { headers: { cookie } })).text();
      assert.match(html, /sudah tersambung/);
    },
    { fonnte, accountToken: "ACCT-TOKEN" }
  );
});

test("self-service connect explains Fonnte errors and falls back to manual when no account token", async () => {
  const { db } = setup();
  const err = Object.assign(new Error("too much free device"), { fonnteReason: "too much free device" });
  await withServer(
    db,
    async (base) => {
      const cookie = await register(base, "a@toko.id", "A");
      await post(base, "/pengaturan", cookie, { name: "A", wa_number: "0812000" });
      const r = await post(base, "/whatsapp/mulai", cookie, {});
      assert.match(decodeURIComponent(r.headers.get("location")), /Kuota device gratis Fonnte platform penuh/);
      assert.equal(db.prepare("SELECT fonnte_token FROM tenants WHERE email = 'a@toko.id'").get().fonnte_token, "");
    },
    { fonnte: fakeFonnte({ addDevice: err }), accountToken: "ACCT" }
  );
  await withServer(db, async (base) => {
    const cookie = await register(base, "b@toko.id", "B");
    await post(base, "/pengaturan", cookie, { name: "B", wa_number: "0812001" });
    const html = await (await fetch(`${base}/whatsapp`, { headers: { cookie } })).text();
    assert.match(html, /Tim kami akan menyiapkan sambungan/);
  });
});

test("@lid senders are kept verbatim", () => {
  assert.equal(parseIncoming({ sender: "123456789@lid", message: "hi" }).phone, "123456789@lid");
});
