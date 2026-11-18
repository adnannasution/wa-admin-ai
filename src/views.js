import { ORDER_STATUSES } from "./db.js";
import { rupiah } from "./fonnte.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--text:#1d2329;--muted:#66707a;--line:#e3e6ea;--brand:#128c4a;--warn:#b45309}
@media (prefers-color-scheme:dark){:root{--bg:#111518;--card:#1a1f23;--text:#e8ecef;--muted:#9aa4ad;--line:#2b3238;--brand:#2fbf71;--warn:#f59e0b}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--text)}
header{background:var(--card);border-bottom:1px solid var(--line);padding:12px 16px;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
header b{color:var(--brand)}header a{color:var(--text);text-decoration:none}header a:hover{color:var(--brand)}
main{max-width:1000px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:16px}
table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.scroll{overflow-x:auto}
input,textarea,select{width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text);font:inherit}
textarea{min-height:90px}label{display:block;margin:10px 0 4px;color:var(--muted);font-size:13px}
button,.btn{background:var(--brand);color:#fff;border:0;border-radius:6px;padding:8px 14px;font:inherit;cursor:pointer;text-decoration:none;display:inline-block}
button.secondary{background:transparent;color:var(--text);border:1px solid var(--line)}
.row{display:flex;gap:12px;flex-wrap:wrap}.row>*{flex:1;min-width:140px}
.stat{font-size:28px;font-weight:600}.muted{color:var(--muted)}.warn{color:var(--warn);font-weight:600}
.msg{padding:8px 12px;border-radius:10px;margin:6px 0;max-width:80%;white-space:pre-wrap}
.msg.user{background:var(--bg);border:1px solid var(--line)}.msg.assistant,.msg.admin{background:var(--brand);color:#fff;margin-left:auto}
.msg small{display:block;opacity:.7;font-size:11px}
code{background:var(--bg);padding:2px 6px;border-radius:4px;word-break:break-all}
.flash{background:#fef3c7;color:#78350f;padding:10px;border-radius:6px;margin-bottom:12px}
`;

export function layout(title, body, { tenant, flash } = {}) {
  const nav = tenant
    ? `<header><b>WA Admin AI</b><a href="/dashboard">Dashboard</a><a href="/percakapan">Percakapan</a><a href="/pesanan">Pesanan</a><a href="/produk">Produk</a><a href="/pengaturan">Pengaturan</a><form method="post" action="/logout" style="margin-left:auto"><button class="secondary">Keluar</button></form></header>`
    : `<header><b>WA Admin AI</b></header>`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${nav}<main>${flash ? `<div class="flash">${esc(flash)}</div>` : ""}${body}</main></body></html>`;
}

export function authPage(mode, error) {
  const isReg = mode === "register";
  return layout(
    isReg ? "Daftar" : "Masuk",
    `<div class="card" style="max-width:420px;margin:40px auto">
      <h2>${isReg ? "Daftar toko" : "Masuk"}</h2>
      ${error ? `<div class="flash">${esc(error)}</div>` : ""}
      <form method="post" action="/${isReg ? "register" : "login"}">
        ${isReg ? `<label>Nama toko</label><input name="name" required>` : ""}
        <label>Email</label><input name="email" type="email" required>
        <label>Password</label><input name="password" type="password" minlength="8" required>
        <p><button>${isReg ? "Daftar" : "Masuk"}</button></p>
      </form>
      <p class="muted">${isReg ? `Sudah punya akun? <a href="/login">Masuk</a>` : `Belum punya akun? <a href="/register">Daftar</a>`}</p>
    </div>`
  );
}

export function dashboardPage(tenant, stats, webhookUrl, flash) {
  return layout(
    "Dashboard",
    `<div class="row">
      <div class="card"><div class="muted">Pesanan hari ini</div><div class="stat">${stats.ordersToday}</div></div>
      <div class="card"><div class="muted">Omzet dibayar (30 hari)</div><div class="stat">${rupiah(stats.revenue30)}</div></div>
      <div class="card"><div class="muted">Menunggu bayar</div><div class="stat">${stats.unpaid}</div></div>
      <div class="card"><div class="muted">Perlu admin</div><div class="stat ${stats.attention ? "warn" : ""}">${stats.attention}</div></div>
    </div>
    <div class="card">
      <h3>Sambungkan Fonnte</h3>
      <ol>
        <li>Isi <b>token device Fonnte</b> di <a href="/pengaturan">Pengaturan</a>.</li>
        <li>Di dashboard Fonnte → Device → Edit, isi <b>Webhook</b> dengan URL ini:<br><code>${esc(webhookUrl)}</code></li>
        <li>Aktifkan "Autoread" di Fonnte bila perlu, lalu coba kirim chat ke nomor toko.</li>
      </ol>
      <p>Status: ${tenant.fonnte_token ? "✅ token terisi" : '<span class="warn">token belum diisi</span>'} · AI ${tenant.ai_enabled ? "✅ aktif" : '<span class="warn">nonaktif</span>'}</p>
    </div>`,
    { tenant, flash }
  );
}

export function productsPage(tenant, products, flash) {
  const rows = products
    .map(
      (p) => `<tr><td>${p.id}</td><td>${esc(p.name)}<div class="muted">${esc(p.description)}</div></td><td>${rupiah(p.price)}</td>
      <td>${p.stock === null ? "∞" : p.stock}</td><td>${p.active ? "Aktif" : "Nonaktif"}</td>
      <td><a href="/produk/${p.id}">Ubah</a></td></tr>`
    )
    .join("");
  return layout(
    "Produk",
    `<div class="card"><h3>Tambah produk</h3>${productForm({}, "/produk")}</div>
     <div class="card scroll"><table><tr><th>ID</th><th>Produk</th><th>Harga</th><th>Stok</th><th>Status</th><th></th></tr>${rows || '<tr><td colspan="6" class="muted">Belum ada produk.</td></tr>'}</table></div>`,
    { tenant, flash }
  );
}

export function productForm(p, action) {
  return `<form method="post" action="${action}">
    <div class="row"><div><label>Nama</label><input name="name" required value="${esc(p.name)}"></div>
    <div><label>Harga (Rp)</label><input name="price" type="number" min="0" required value="${esc(p.price)}"></div>
    <div><label>Stok (kosongkan = tak terbatas)</label><input name="stock" type="number" min="0" value="${p.stock ?? ""}"></div></div>
    <label>Deskripsi</label><input name="description" value="${esc(p.description)}">
    ${p.id ? `<label><input type="checkbox" name="active" value="1" style="width:auto" ${p.active ? "checked" : ""}> Aktif</label>` : ""}
    <p><button>Simpan</button></p></form>`;
}

export function productEditPage(tenant, p) {
  return layout("Ubah produk", `<div class="card"><h3>Ubah produk #${p.id}</h3>${productForm(p, `/produk/${p.id}`)}</div>`, { tenant });
}

export function ordersPage(tenant, orders, status, flash) {
  const filters = [["", "Semua"], ...Object.entries(ORDER_STATUSES)]
    .map(([k, v]) => (k === status ? `<b>${v}</b>` : `<a href="/pesanan${k ? `?status=${k}` : ""}">${v}</a>`))
    .join(" · ");
  const rows = orders
    .map((o) => {
      const items = JSON.parse(o.items_json)
        .map((l) => `${l.qty}× ${esc(l.name)}`)
        .join("<br>");
      const opts = Object.entries(ORDER_STATUSES)
        .map(([k, v]) => `<option value="${k}" ${k === o.status ? "selected" : ""}>${v}</option>`)
        .join("");
      return `<tr><td><b>${esc(o.code)}</b><div class="muted">${esc(o.created_at)}</div></td>
        <td>${esc(o.customer_name)}<div class="muted">${esc(o.phone)}</div><div class="muted">${esc(o.address)}</div>${o.note ? `<div>📝 ${esc(o.note)}</div>` : ""}</td>
        <td>${items}</td><td>${rupiah(o.total)}</td>
        <td><form method="post" action="/pesanan/${o.id}/status"><select name="status">${opts}</select>
          <input name="info" placeholder="No. resi / catatan (opsional)" style="margin-top:6px">
          <label style="margin:6px 0"><input type="checkbox" name="notify" value="1" checked style="width:auto"> Kabari pelanggan</label>
          <button>Update</button></form></td></tr>`;
    })
    .join("");
  return layout(
    "Pesanan",
    `<div class="card"><div class="row" style="align-items:center"><div>${filters}</div><div style="text-align:right;flex:0"><a class="btn" href="/pesanan.csv${status ? `?status=${status}` : ""}">Export CSV</a></div></div></div>
     <div class="card scroll"><table><tr><th>Kode</th><th>Pelanggan</th><th>Item</th><th>Total</th><th>Status</th></tr>${rows || '<tr><td colspan="5" class="muted">Belum ada pesanan.</td></tr>'}</table></div>`,
    { tenant, flash }
  );
}

export function contactsPage(tenant, contacts) {
  const rows = contacts
    .map(
      (c) => `<tr><td><a href="/percakapan/${c.id}">${esc(c.name || c.phone)}</a><div class="muted">${esc(c.phone)}</div></td>
      <td>${esc((c.last_text || "").slice(0, 80))}</td><td class="muted">${esc(c.last_message_at)}</td>
      <td>${c.needs_attention ? '<span class="warn">Perlu admin</span>' : c.ai_paused ? "AI dijeda" : "AI aktif"}</td></tr>`
    )
    .join("");
  return layout(
    "Percakapan",
    `<div class="card scroll"><table><tr><th>Kontak</th><th>Pesan terakhir</th><th>Waktu</th><th>Status</th></tr>${rows || '<tr><td colspan="4" class="muted">Belum ada chat masuk.</td></tr>'}</table></div>`,
    { tenant }
  );
}

export function conversationPage(tenant, contact, messages, flash) {
  const bubbles = messages
    .map(
      (m) =>
        `<div class="msg ${m.role}"><small>${m.role === "user" ? "Pelanggan" : m.role === "admin" ? "Admin" : "AI"} · ${esc(m.created_at)}</small>${esc(m.content)}</div>`
    )
    .join("");
  return layout(
    contact.name || contact.phone,
    `<div class="card"><h3>${esc(contact.name || contact.phone)} <span class="muted">${esc(contact.phone)}</span></h3>
      <form method="post" action="/percakapan/${contact.id}/ai" style="display:inline">
        <input type="hidden" name="paused" value="${contact.ai_paused ? 0 : 1}">
        <button class="secondary">${contact.ai_paused ? "▶️ Aktifkan AI lagi" : "⏸️ Jeda AI (ambil alih)"}</button></form>
      ${contact.needs_attention ? '<span class="warn"> · Perlu admin</span>' : ""}</div>
    <div class="card">${bubbles || '<p class="muted">Belum ada pesan.</p>'}</div>
    <div class="card"><form method="post" action="/percakapan/${contact.id}/balas">
      <label>Balas sebagai admin (AI otomatis dijeda)</label><textarea name="message" required></textarea>
      <p><button>Kirim</button></p></form></div>`,
    { tenant, flash }
  );
}

export function settingsPage(tenant, flash) {
  return layout(
    "Pengaturan",
    `<div class="card"><form method="post" action="/pengaturan">
      <label>Nama toko</label><input name="name" required value="${esc(tenant.name)}">
      <label>Token device Fonnte</label><input name="fonnte_token" value="${esc(tenant.fonnte_token)}" autocomplete="off">
      <label>Nomor WA pemilik (untuk notifikasi pesanan & eskalasi), mis. 0812...</label><input name="owner_phone" value="${esc(tenant.owner_phone)}">
      <label>Info toko (jam buka, alamat, ongkir, kebijakan retur, FAQ) — dipakai AI untuk menjawab</label><textarea name="store_info" style="min-height:160px">${esc(tenant.store_info)}</textarea>
      <label>Cara pembayaran (rekening / QRIS / e-wallet)</label><textarea name="payment_info">${esc(tenant.payment_info)}</textarea>
      <label><input type="checkbox" name="ai_enabled" value="1" style="width:auto" ${tenant.ai_enabled ? "checked" : ""}> AI auto-reply aktif</label>
      <p><button>Simpan</button></p></form></div>`,
    { tenant, flash }
  );
}
