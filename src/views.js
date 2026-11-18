import { ORDER_STATUSES, isAiPaused } from "./db.js";
import { rupiah } from "./fonnte.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Escapes text, then renders WhatsApp *bold* and _italic_. */
export const waFormat = (s) =>
  esc(s)
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<b>$2</b>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<i>$2</i>");

const OWNER_HELP_HTML = `<ul>
  <li><code>#stop 0812xxxx</code> — AI berhenti membalas pelanggan itu (kamu balas manual dari HP)</li>
  <li><code>#start 0812xxxx</code> — AI aktif lagi untuk pelanggan itu</li>
  <li><code>#stop semua</code> / <code>#start semua</code> — matikan / nyalakan AI untuk semua chat</li>
  <li><code>#status</code> — cek status AI</li></ul>`;

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
    ? `<header><b>WA Admin AI</b><a href="/dashboard">Dashboard</a><a href="/whatsapp">WhatsApp</a><a href="/percakapan">Percakapan</a><a href="/pesanan">Pesanan</a><a href="/produk">Produk</a><a href="/pengaturan">Pengaturan</a>${tenant.is_super ? '<a href="/admin"><b>Admin Platform</b></a>' : ""}<form method="post" action="/logout" style="margin-left:auto"><button class="secondary">Keluar</button></form></header>`
    : `<header><b>WA Admin AI</b></header>`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${nav}<main>${tenant && !tenant.active ? '<div class="flash">⛔ Akun toko ini sedang nonaktif, jadi AI tidak membalas chat. Hubungi admin WA Admin AI.</div>' : ""}${flash ? `<div class="flash">${esc(flash)}</div>` : ""}${body}</main></body></html>`;
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

export function waStatusHtml(tenant) {
  if (tenant.fonnte_token && tenant.wa_status === "connect")
    return `✅ WhatsApp tersambung${tenant.wa_number ? ` (${esc(tenant.wa_number)})` : ""}`;
  if (!tenant.wa_number) return `<span class="warn">⏳ Belum tersambung.</span> Isi <b>nomor WhatsApp toko</b> di <a href="/pengaturan">Pengaturan</a> dulu.`;
  if (tenant.fonnte_token && tenant.wa_status === "disconnect" && tenant.wa_status_reason)
    return `<span class="warn">⚠️ WhatsApp terputus</span> (${esc(tenant.wa_status_reason)}). <a href="/whatsapp">Sambungkan lagi →</a>`;
  return `<span class="warn">⏳ Belum tersambung.</span> <a href="/whatsapp">Sambungkan WhatsApp sekarang →</a> (cukup scan QR sekali, seperti WhatsApp Web)`;
}

export function dashboardPage(tenant, stats, flash) {
  return layout(
    "Dashboard",
    `<div class="row">
      <div class="card"><div class="muted">Pesanan hari ini</div><div class="stat">${stats.ordersToday}</div></div>
      <div class="card"><div class="muted">Omzet dibayar (30 hari)</div><div class="stat">${rupiah(stats.revenue30)}</div></div>
      <div class="card"><div class="muted">Menunggu bayar</div><div class="stat">${stats.unpaid}</div></div>
      <div class="card"><div class="muted">Perlu admin</div><div class="stat ${stats.attention ? "warn" : ""}">${stats.attention}</div></div>
    </div>
    <div class="card">
      <h3>Status WhatsApp</h3>
      <p>${waStatusHtml(tenant)}</p>
      <p>AI auto-reply: ${tenant.ai_enabled ? "✅ aktif" : '<span class="warn">nonaktif</span>'}</p>
    </div>
    <div class="card">
      <h3>Mau balas sendiri dari HP?</h3>
      <p class="muted">Kirim perintah dari <b>nomor pemilik</b> ${tenant.owner_phone ? `(${esc(tenant.owner_phone)})` : '(isi dulu di <a href="/pengaturan">Pengaturan</a>)'} ke nomor toko supaya AI tidak ikut membalas:</p>
      ${OWNER_HELP_HTML}
      <p class="muted">Kalau kamu membalas dari halaman Percakapan di sini, AI otomatis diam selama 1 jam untuk chat itu.</p>
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
      <td>${c.needs_attention ? '<span class="warn">Perlu admin</span>' : c.ai_paused ? "AI dijeda" : isAiPaused(c) ? "AI diam sementara" : "AI aktif"}</td></tr>`
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
        `<div class="msg ${m.role}"><small>${m.role === "user" ? "Pelanggan" : m.role === "admin" ? "Admin" : "AI"} · ${esc(m.created_at)}</small>${waFormat(m.content)}</div>`
    )
    .join("");
  return layout(
    contact.name || contact.phone,
    `<div class="card"><h3>${esc(contact.name || contact.phone)} <span class="muted">${esc(contact.phone)}</span></h3>
      <form method="post" action="/percakapan/${contact.id}/ai" style="display:inline">
        <input type="hidden" name="paused" value="${contact.ai_paused ? 0 : 1}">
        <button class="secondary">${contact.ai_paused ? "▶️ Aktifkan AI lagi" : "⏸️ Jeda AI (ambil alih)"}</button></form>
      ${contact.needs_attention ? '<span class="warn"> · Perlu admin</span>' : ""}
      ${!contact.ai_paused && isAiPaused(contact) ? `<span class="muted"> · AI diam sementara sampai ${esc(contact.ai_paused_until)} UTC</span>` : ""}</div>
    <div class="card">${bubbles || '<p class="muted">Belum ada pesan.</p>'}</div>
    <div class="card"><form method="post" action="/percakapan/${contact.id}/balas">
      <label>Balas sebagai admin (AI otomatis diam 1 jam untuk chat ini)</label><textarea name="message" required></textarea>
      <p><button>Kirim</button></p></form></div>`,
    { tenant, flash }
  );
}

export function settingsPage(tenant, flash) {
  return layout(
    "Pengaturan",
    `<div class="card"><form method="post" action="/pengaturan">
      <label>Nama toko</label><input name="name" required value="${esc(tenant.name)}">
      <label>Nomor WhatsApp toko (nomor yang dipakai pelanggan untuk chat)</label><input name="wa_number" value="${esc(tenant.wa_number)}" placeholder="0812...">
      <p class="muted" style="margin:4px 0 0">${waStatusHtml(tenant)}</p>
      <label>Nomor WA pemilik — untuk notifikasi pesanan, eskalasi, dan perintah #stop/#start. Harus beda dengan nomor toko.</label><input name="owner_phone" value="${esc(tenant.owner_phone)}">
      <label>Info toko (jam buka, alamat, ongkir, kebijakan retur, FAQ) — dipakai AI untuk menjawab</label><textarea name="store_info" style="min-height:160px">${esc(tenant.store_info)}</textarea>
      <label>Cara pembayaran (rekening / QRIS / e-wallet)</label><textarea name="payment_info">${esc(tenant.payment_info)}</textarea>
      <label><input type="checkbox" name="ai_enabled" value="1" style="width:auto" ${tenant.ai_enabled ? "checked" : ""}> AI auto-reply aktif</label>
      <p><button>Simpan</button></p></form></div>`,
    { tenant, flash }
  );
}

// ---------- platform admin ----------
export function adminShopsPage(me, shops, flash) {
  const rows = shops
    .map(
      (t) => `<tr><td><a href="/admin/toko/${t.id}"><b>${esc(t.name)}</b></a><div class="muted">${esc(t.email)}</div></td>
      <td>${esc(t.wa_number) || '<span class="muted">-</span>'}</td>
      <td>${t.fonnte_token ? "✅ Tersambung" : '<span class="warn">Belum</span>'}</td>
      <td>${t.active ? "Aktif" : '<span class="warn">Nonaktif</span>'}</td>
      <td>${t.orders30}</td><td>${t.ai30}</td><td class="muted">${esc(t.last_in || "-")}</td>
      <td class="muted">${esc(t.created_at)}</td></tr>`
    )
    .join("");
  const pending = shops.filter((t) => !t.fonnte_token).length;
  return layout(
    "Admin Platform",
    `<div class="row">
      <div class="card"><div class="muted">Total toko</div><div class="stat">${shops.length}</div></div>
      <div class="card"><div class="muted">Menunggu disambungkan</div><div class="stat ${pending ? "warn" : ""}">${pending}</div></div>
      <div class="card"><div class="muted">Balasan AI (30 hari)</div><div class="stat">${shops.reduce((a, t) => a + t.ai30, 0)}</div></div>
    </div>
    <div class="card scroll"><table><tr><th>Toko</th><th>Nomor WA</th><th>Fonnte</th><th>Status</th><th>Pesanan 30h</th><th>Balasan AI 30h</th><th>Chat terakhir</th><th>Daftar</th></tr>
    ${rows || '<tr><td colspan="8" class="muted">Belum ada toko.</td></tr>'}</table></div>`,
    { tenant: me, flash }
  );
}

export function adminShopPage(me, shop, webhookUrl, device, autoEnabled, flash) {
  return layout(
    `Admin · ${shop.name}`,
    `<p><a href="/admin">← Semua toko</a></p>
    <div class="card"><h3>${esc(shop.name)}</h3>
      <p class="muted">${esc(shop.email)} · pemilik: ${esc(shop.owner_phone) || "-"} · daftar ${esc(shop.created_at)}</p></div>
    <div class="card"><h3>Device Fonnte</h3>
      ${
        device?.error
          ? `<p class="warn">${esc(device.error)}</p>`
          : device
            ? `<p>Status: <b>${device.device_status === "connect" ? "✅ connect" : "⚠️ " + esc(device.device_status)}</b> · Paket: <b>${esc(device.package)}</b> · Kuota pesan: <b>${esc(device.quota)}</b> · Berlaku sampai: <b>${esc(device.expired)}</b></p>`
            : '<p class="muted">Belum ada device.</p>'
      }
      ${shop.wa_status_reason ? `<p class="muted">Event terakhir: ${esc(shop.wa_status)} — ${esc(shop.wa_status_reason)} (${esc(shop.wa_status_at)})</p>` : ""}
      ${
        autoEnabled
          ? `<form method="post" action="/admin/toko/${shop.id}/setup"><button>${shop.fonnte_token ? "Atur ulang webhook device" : "Buat device otomatis"}</button></form>
             <p class="muted">Pemilik lalu scan QR sendiri di menu <b>WhatsApp</b> dashboard-nya. Ingat: tiap device yang tersambung butuh paket Fonnte berbayar (hanya 1 device gratis per akun).</p>`
          : '<p class="warn">FONNTE_ACCOUNT_TOKEN belum diisi, jadi pembuatan device otomatis nonaktif. Gunakan langkah manual di bawah.</p>'
      }</div>
    <details class="card"><summary><b>Langkah manual (tanpa API)</b></summary>
      <ol>
        <li>Login dashboard Fonnte → <b>Add device</b> dengan nomor <b>${esc(shop.wa_number) || "(pedagang belum mengisi nomor toko)"}</b>.</li>
        <li>Edit device: set <b>Autoread ON</b> (wajib, tanpa ini webhook tidak jalan), personal ON, group OFF.</li>
        <li>Isi <b>Webhook</b>: <code>${esc(webhookUrl)}</code><br>dan <b>Webhook connect</b>: <code>${esc(webhookUrl)}/status</code></li>
        <li>Salin <b>token device</b> ke form di bawah dan simpan. Pemilik lalu scan QR dari menu WhatsApp di dashboard-nya.</li>
      </ol></details>
    <div class="card"><form method="post" action="/admin/toko/${shop.id}">
      <label>Nomor WA toko (device Fonnte)</label><input name="wa_number" value="${esc(shop.wa_number)}">
      <label>Token device Fonnte ${shop.fonnte_token ? `(tersimpan: ••••${esc(shop.fonnte_token.slice(-4))} — kosongkan jika tidak diganti)` : "(belum ada)"}</label>
      <input name="fonnte_token" type="password" autocomplete="off" placeholder="${shop.fonnte_token ? "biarkan kosong untuk tetap" : "tempel token di sini"}">
      ${shop.fonnte_token ? '<label><input type="checkbox" name="clear_token" value="1" style="width:auto"> Hapus token (putuskan WA)</label>' : ""}
      <label><input type="checkbox" name="active" value="1" style="width:auto" ${shop.active ? "checked" : ""}> Akun aktif (hapus centang untuk menangguhkan, misalnya belum bayar)</label>
      <p><button>Simpan</button></p></form>
      <form method="post" action="/admin/toko/${shop.id}/tes">
        ${shop.owner_phone ? "" : '<label>Nomor tujuan tes</label><input name="target" placeholder="0812...">'}
        <p><button class="secondary">Tes kirim WA${shop.owner_phone ? ` ke ${esc(shop.owner_phone)}` : ""}</button></p></form></div>`,
    { tenant: me, flash }
  );
}

// ---------- WhatsApp connection page ----------
export function whatsappPage(tenant, autoEnabled, flash) {
  const connected = tenant.fonnte_token && tenant.wa_status === "connect";
  let body;
  if (!tenant.wa_number) {
    body = `<p>Isi dulu <b>nomor WhatsApp toko</b> di <a href="/pengaturan">Pengaturan</a>.</p>`;
  } else if (connected) {
    body = `<p style="font-size:18px">✅ <b>WhatsApp ${esc(tenant.wa_number)} sudah tersambung.</b> AI siap membalas chat pelanggan.</p>
      <form method="post" action="/whatsapp/putus" onsubmit="return confirm('Putuskan WhatsApp? AI berhenti membalas sampai disambungkan lagi.')">
        <button class="secondary">Putuskan WhatsApp</button></form>`;
  } else if (!tenant.fonnte_token) {
    body = autoEnabled
      ? `<p>Nomor toko: <b>${esc(tenant.wa_number)}</b></p>
         <form method="post" action="/whatsapp/mulai"><button>Sambungkan WhatsApp</button></form>
         <p class="muted">Setelah diklik, QR akan muncul di halaman ini.</p>`
      : `<p>⏳ Tim kami akan menyiapkan sambungan untuk nomor <b>${esc(tenant.wa_number)}</b>. Kamu akan dikabari jika QR sudah siap.</p>`;
  } else {
    body = `<div class="row" style="align-items:flex-start">
      <div style="flex:0 0 280px;text-align:center">
        <div id="qrbox" style="width:264px;height:264px;margin:auto;border:1px solid var(--line);border-radius:10px;display:flex;align-items:center;justify-content:center;background:#fff">
          <span class="muted">Memuat QR…</span></div>
        <p id="codebox" style="font:600 26px/1.3 monospace;letter-spacing:3px;display:none"></p>
        <p><button type="button" class="secondary" id="toggle">Tidak bisa scan? Pakai kode</button></p>
      </div>
      <div>
        <h3>Cara menyambungkan</h3>
        <ol id="steps-qr">
          <li>Buka <b>WhatsApp</b> di HP yang memakai nomor <b>${esc(tenant.wa_number)}</b>.</li>
          <li>Ketuk <b>⋮ / Pengaturan → Perangkat tertaut → Tautkan perangkat</b>.</li>
          <li>Arahkan kamera ke QR di samping.</li>
        </ol>
        <ol id="steps-code" style="display:none">
          <li>Buka <b>WhatsApp</b> nomor <b>${esc(tenant.wa_number)}</b>.</li>
          <li>Ketuk <b>Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon saja</b>.</li>
          <li>Masukkan kode yang tampil di samping.</li>
        </ol>
        <p class="muted">QR diperbarui otomatis. Halaman ini akan berubah sendiri setelah tersambung.</p>
        <p id="err" class="warn"></p>
      </div></div>
      <script>
      (() => {
        let mode = "qr";
        const box = document.getElementById("qrbox"), code = document.getElementById("codebox"), err = document.getElementById("err");
        async function load() {
          err.textContent = "";
          try {
            const r = await (await fetch("/whatsapp/qr?type=" + mode)).json();
            if (r.connected) return location.reload();
            if (r.error) { err.textContent = r.error; return; }
            if (mode === "qr") { box.innerHTML = '<img alt="QR WhatsApp" style="width:256px;height:256px" src="data:image/png;base64,' + r.qr + '">'; }
            else { code.textContent = r.code; }
          } catch (e) { err.textContent = "Gagal memuat, mencoba lagi…"; }
        }
        async function poll() {
          try { const r = await (await fetch("/whatsapp/status")).json(); if (r.status === "connect") location.reload(); } catch (e) {}
        }
        document.getElementById("toggle").onclick = (ev) => {
          mode = mode === "qr" ? "code" : "qr";
          box.style.display = mode === "qr" ? "flex" : "none"; code.style.display = mode === "code" ? "block" : "none";
          document.getElementById("steps-qr").style.display = mode === "qr" ? "" : "none";
          document.getElementById("steps-code").style.display = mode === "code" ? "" : "none";
          ev.target.textContent = mode === "qr" ? "Tidak bisa scan? Pakai kode" : "Pakai QR";
          load();
        };
        load(); setInterval(load, 30000); setInterval(poll, 5000);
      })();
      </script>`;
  }
  return layout("Sambungkan WhatsApp", `<div class="card"><h2>WhatsApp toko</h2>${body}</div>`, { tenant, flash });
}
