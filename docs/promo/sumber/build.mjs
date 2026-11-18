// Builds the promo videos' HTML timelines (YouTube 16:9 and TikTok 9:16).
// Every animation is CSS, delayed relative to its scene start (--s) + offset (--o),
// so the renderer can seek the whole page to any time t deterministically.
import fs from "node:fs";

const IMG = new URL("../../manual/img", import.meta.url).pathname;
const out = process.argv[2] || ".";

// ------------------------------------------------------------------ components
const o = (sec) => `--o:${sec}s`;
const bubble = (dir, html, at, meta = "") =>
  `<div class="b ${dir} pop" style="${o(at)}">${html}${meta ? `<span class="t">${meta}</span>` : ""}</div>`;
const typing = (at, until) => `<div class="b in typing blip" style="${o(at)};--len:${until - at}s"><i></i><i></i><i></i></div>`;
const chip = (html, at, cls = "") => `<span class="chip pop2 ${cls}" style="${o(at)}">${html}</span>`;

function phone(body, { at = 0, notif = "", extraCls = "" } = {}) {
  return `<div class="phone rise ${extraCls}" style="${o(at)}">
    <div class="notch"></div>
    <div class="wa-head"><span class="av">DK</span><div><b>Dapur Kue Bunda</b><small>online</small></div></div>
    <div class="chat">${body}</div>
    <div class="wa-input"><span>Ketik pesan</span><i></i></div>
    ${notif}
  </div>`;
}
const notifCard = (at, title, text) =>
  `<div class="notif drop" style="${o(at)}"><div class="nh"><span class="nlogo"></span>WA Admin AI · sekarang</div><b>${title}</b><p>${text}</p></div>`;
const laptop = (src, at = 0, cls = "") =>
  `<div class="laptop rise ${cls}" style="${o(at)}"><div class="bar"><i></i><i></i><i></i><span>wa-admin-ai</span></div><img src="${src}"></div>`;
const headline = (kicker, html, sub, at = 0.15) =>
  `<div class="copy">${kicker ? `<div class="kicker up" style="${o(at)}">${kicker}</div>` : ""}<h2 class="hl up" style="${o(at + 0.12)}">${html}</h2>${
    sub ? `<p class="sub up" style="${o(at + 0.35)}">${sub}</p>` : ""
  }</div>`;
const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.2A8.5 8.5 0 1 1 20.5 11.6z"/><path d="M9 9.2c.2 1.6 2.2 4.4 4.6 5 .6.1 1.3-.4 1.5-1l-1.5-.9-.8.6c-.9-.4-1.8-1.3-2.2-2.2l.6-.8L10.3 8.4c-.6.2-1.4.3-1.3.8z"/></svg>`;

// ------------------------------------------------------------------ scene visuals (shared)
const V = {
  pile: (fmt) => {
    const msgs = [
      ["Ani", "Kak, brownies masih ada?"],
      ["Rudi", "Ongkir ke Depok berapa?"],
      ["Sari", "Udah transfer ya kak 🙏"],
      ["Dewi", "Bisa COD nggak?"],
      ["Budi", "Kak?? kok belum dibalas"],
      ["Rina", "Pesan 3 ya, kirim besok"],
      ["Joko", "Masih buka jam segini?"],
    ];
    return `<div class="pile">${msgs
      .map(
        ([n, m], i) =>
          `<div class="pn pop" style="${o(0.35 + i * 0.42)}"><span class="pav" style="--c:${["#f59e0b", "#6366f1", "#ec4899", "#0ea5e9", "#ef4444", "#8b5cf6", "#14b8a6"][i]}">${n[0]}</span><div><b>${n}</b><p>${m}</p></div><span class="pt">${["02.13", "02.14", "02.14", "02.15", "02.16", "02.16", "02.17"][i]}</span></div>`
      )
      .join("")}<div class="badge99 pop2" style="${o(3.4)}">99+</div></div>`;
  },
  pains: () =>
    `<div class="pains">${[
      ["💬", "Balas chat satu-satu"],
      ["📝", "Catat pesanan manual"],
      ["💸", "Nagih yang belum transfer"],
      ["🏃", "Telat dikit, pembeli kabur"],
    ]
      .map(([e, t], i) => `<div class="pain pop2" style="${o(0.5 + i * 1.1)}"><span>${e}</span>${t}</div>`)
      .join("")}</div>`,
  intro: () =>
    `<div class="intro"><div class="biglogo zoom" style="${o(0.1)}">${LOGO}</div><div class="brandname up" style="${o(0.7)}">WA Admin AI</div><div class="tagline up" style="${o(1.2)}">Admin WhatsApp yang kerja <em>24 jam</em> untuk tokomu</div></div>`,
  chatPrice: () =>
    phone(
      bubble("in", "Kak, brownies masih ada? harganya berapa ya", 0.6, "02.13") +
        typing(1.4, 2.6) +
        bubble("out", "Masih ada kak 😊 <b>Brownies Panggang</b> Rp65.000 per loyang, topping almond. Mau pesan berapa?", 2.6, "02.13 ✓✓") +
        `<div class="ai-tag pop2" style="${o(3.2)}">🤖 dibalas AI dalam 3 detik</div>`
    ),
  chatOrder: () =>
    phone(
      bubble("in", "Mau 2 ya kak, kirim ke Jl. Kenari 5 Bogor", 0.4, "10.21") +
        bubble("out", "Siap kak! Ringkasannya:<br>• 2x Brownies Panggang = Rp130.000<br>• Ongkir Rp10.000<br><b>Total Rp140.000</b>. Sudah sesuai?", 1.4, "10.21 ✓✓") +
        bubble("in", "Oke setuju 👍", 3.0, "10.22") +
        typing(3.6, 4.5) +
        `<div class="b out invoice pop" style="${o(4.5)}"><div class="inv-h">🧾 INVOICE</div><div class="inv-c">INV261118-MB7L</div><div class="inv-r"><span>Total</span><b>Rp140.000</b></div><div class="inv-p">Transfer BCA 1234567890<br>a.n. Bunda Sari</div><span class="t">10.22 ✓✓</span></div>`
    ),
  chatReminder: () =>
    phone(
      `<div class="day pop" style="${o(0.2)}">6 jam kemudian ⏰</div>` +
        bubble("out", "Halo kak Ani, pengingat dari <b>Dapur Kue Bunda</b> 🙏<br>Pesanan <b>INV261118-MB7L</b> sebesar <b>Rp140.000</b> masih menunggu pembayaran.", 0.8, "16.22 ✓✓") +
        bubble("in", "Astaga lupa 😅 udah ditransfer ya kak", 2.6, "16.30")
    ),
  chatHandoff: () =>
    phone(
      bubble("in", "Kak, kue lapisnya datang penyok 😞", 0.4, "13.05") +
        typing(1.0, 1.9) +
        bubble("out", "Mohon maaf banget kak 🙏 Sudah saya teruskan ke admin, sebentar lagi langsung dibantu ya.", 1.9, "13.05 ✓✓"),
      { notif: notifCard(3.0, "🔔 Perlu admin: Budi Santoso", "Komplain: kue datang penyok. AI berhenti membalas chat ini.") }
    ),
  setup: (fmt) =>
    `<div class="setup">${laptop(`${IMG}/p09-wa-qr.jpg`, 0.2, "lap-setup")}<div class="steps">${[
      ["1", "Daftar akun"],
      ["2", "Isi produk & info toko"],
      ["3", "Scan QR sekali"],
    ]
      .map(([n, t], i) => `<div class="step pop2" style="${o(1.0 + i * 0.9)}"><b>${n}</b>${t}</div>`)
      .join("")}<div class="step done pop2" style="${o(3.8)}"><b>✓</b>Jalan dalam 5 menit</div></div></div>`,
  dash: (fmt) =>
    `<div class="dash">${laptop(`${IMG}/p17-dashboard.jpg`, 0.2, "lap-dash")}<div class="mini-phone rise" style="${o(0.9)}"><img src="${IMG}/m02-dashboard.jpg"></div></div>`,
  cta: (fmt, ctaText) =>
    `<div class="cta"><div class="biglogo zoom" style="${o(0.1)}">${LOGO}</div><div class="brandname up" style="${o(0.5)}">WA Admin AI</div>
     <div class="tagline up" style="${o(0.9)}">Biar AI yang jaga chat.<br><em>Kamu fokus jualan.</em></div>
     <div class="btn pop2" style="${o(1.8)}">${ctaText}</div></div>`,
};

// ------------------------------------------------------------------ scripts
// Each scene: [id, durationSec, onScreenCopy(kicker, headline, sub), visual, narration, ttsNarration]
const YT = [
  ["hook", 5, ["", "Chat pelanggan <em>numpuk</em>?", "Padahal tanganmu cuma dua."], V.pile,
    "Chat pelanggan numpuk, padahal tanganmu cuma dua?",
    "Chat pelanggan numpuk, padahal tanganmu cuma dua?"],
  ["problem", 8, ["Setiap hari", "Capek, kan?", ""], V.pains,
    "Balas satu-satu, catat pesanan manual, nagih yang belum transfer. Telat sedikit, pembeli kabur.",
    "Balas satu-satu, catat pesanan manual, nagih yang belum transfer. Telat sedikit, pembeli kabur."],
  ["intro", 6.5, ["", "", ""], V.intro,
    "Kenalin, WA Admin AI. Admin WhatsApp yang kerja dua puluh empat jam.",
    "Kenalin, We-A Admin Ei-Ai. Admin WhatsApp yang kerja dua puluh empat jam."],
  ["price", 8.5, ["Jawab otomatis", "Tanya harga jam 2 pagi? <em>Langsung dijawab.</em>", "Sesuai katalog & info tokomu — AI nggak ngarang."], V.chatPrice,
    "Tanya harga, stok, atau ongkir? AI langsung jawab, sesuai katalog dan info tokomu. Nggak ngarang.",
    "Tanya harga, stok, atau ongkir? Ei-Ai langsung jawab, sesuai katalog dan info tokomu. Nggak ngarang."],
  ["order", 9, ["Pesanan otomatis", "Order masuk, <em>invoice jadi.</em>", "AI merangkum, minta konfirmasi, lalu kirim cara bayar. Stok berkurang sendiri."], V.chatOrder,
    "Mau pesan? AI rangkum, minta konfirmasi, lalu kirim invoice dan cara bayar. Stok berkurang otomatis.",
    "Mau pesan? Ei-Ai rangkum, minta konfirmasi, lalu kirim invoice dan cara bayar. Stok berkurang otomatis."],
  ["reminder", 5.5, ["Pengingat bayar", "Lupa transfer? <em>Diingatkan otomatis.</em>", ""], V.chatReminder,
    "Pelanggan yang lupa transfer, diingatkan otomatis.",
    "Pelanggan yang lupa transfer, diingatkan otomatis."],
  ["handoff", 7, ["Tetap kamu yang pegang kendali", "Ada komplain? <em>Langsung ke kamu.</em>", "AI berhenti membalas & kamu dapat notifikasi."], V.chatHandoff,
    "Ada komplain? AI langsung serahkan ke kamu, dan kamu dapat notifikasi di WhatsApp.",
    "Ada komplain? Ei-Ai langsung serahkan ke kamu, dan kamu dapat notifikasi di WhatsApp."],
  ["setup", 7.5, ["Gampang mulai", "Pakai <em>nomor WA tokomu sendiri.</em>", ""], V.setup,
    "Pakai nomor WhatsApp tokomu sendiri. Cukup scan QR sekali, lima menit langsung jalan.",
    "Pakai nomor WhatsApp tokomu sendiri. Cukup sken kiu-ar sekali, lima menit langsung jalan."],
  ["dash", 6.5, ["Semua terpantau", "Chat, pesanan & omzet <em>dalam satu dashboard.</em>", "Di laptop atau HP."], V.dash,
    "Pantau chat, pesanan, dan omzet dari satu dashboard, di laptop atau HP.",
    "Pantau chat, pesanan, dan omzet dari satu dasbor, di laptop atau ha-pe."],
  ["cta", 8, ["", "", ""], (f) => V.cta(f, "Daftar sekarang · link di deskripsi"),
    "WA Admin AI. Biar AI yang jaga chat, kamu fokus jualan. Daftar sekarang, link di deskripsi.",
    "We-A Admin Ei-Ai. Biar Ei-Ai yang jaga chat, kamu fokus jualan. Daftar sekarang, link di deskripsi."],
];

const TT = [
  ["hook", 3.5, ["", "Admin tokomu <em>kewalahan</em> balas chat WA?", ""], V.pile,
    "Admin tokomu kewalahan balas chat WA?",
    "Admin tokomu kewalahan balas chat we-a?"],
  ["intro", 5, ["", "", ""], V.intro,
    "Kenalin, WA Admin AI. Admin WA yang kerja dua puluh empat jam.",
    "Kenalin, We-A Admin Ei-Ai. Admin we-a yang kerja dua puluh empat jam."],
  ["price", 6.5, ["", "Nanya harga jam 2 pagi? <em>Langsung dijawab.</em>", ""], V.chatPrice,
    "Pelanggan nanya harga jam dua pagi? Langsung dijawab AI, sesuai katalog tokomu.",
    "Pelanggan nanya harga jam dua pagi? Langsung dijawab Ei-Ai, sesuai katalog tokomu."],
  ["order", 6.5, ["", "Mau order? <em>Invoice jadi otomatis.</em>", ""], V.chatOrder,
    "Mau order? AI rangkum pesanan, bikin invoice, dan kirim cara bayar. Otomatis.",
    "Mau order? Ei-Ai rangkum pesanan, bikin invoice, dan kirim cara bayar. Otomatis."],
  ["reminder", 4, ["", "Lupa transfer? <em>Diingetin sendiri.</em>", ""], V.chatReminder,
    "Yang lupa transfer? Diingetin sendiri.",
    "Yang lupa transfer? Diingetin sendiri."],
  ["handoff", 4.5, ["", "Komplain? <em>Langsung ke kamu.</em>", ""], V.chatHandoff,
    "Ada komplain? Langsung diterusin ke kamu.",
    "Ada komplain? Langsung diterusin ke kamu."],
  ["cta", 8.5, ["", "", ""], (f) => V.cta(f, "Cek link di bio 👆"),
    "Pakai nomor WA tokomu sendiri, scan QR sekali. Biar AI yang jaga chat. Cek link di bio!",
    "Pakai nomor we-a tokomu sendiri, sken kiu-ar sekali. Biar Ei-Ai yang jaga chat. Cek link di bio!"],
];

// ------------------------------------------------------------------ CSS
const CSS = (fmt) => {
  const L = fmt === "yt";
  return `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${L ? 1920 : 1080}px;height:${L ? 1080 : 1920}px;overflow:hidden}
body{font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#fff;background:#04291f}
.bg{position:absolute;inset:0;background:radial-gradient(1200px 800px at 0% 0%,#0e9f6e55,transparent 60%),radial-gradient(1000px 900px at 100% 100%,#34d39940,transparent 60%),linear-gradient(150deg,#022c22,#065f46 55%,#047857)}
.blob{position:absolute;border-radius:50%;filter:blur(60px);opacity:.35;animation:float 14s ease-in-out infinite alternate}
.blob.a{width:520px;height:520px;background:#34d399;left:-120px;top:${L ? 520 : 1250}px}
.blob.b{width:420px;height:420px;background:#22d3ee;right:-100px;top:-80px;animation-duration:18s}
@keyframes float{to{transform:translate(120px,-80px) scale(1.15)}}
.grain{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.06) 1px,transparent 1.2px);background-size:22px 22px}

.scene{position:absolute;inset:0;opacity:0;animation:show var(--d) linear both;animation-delay:var(--s);
  display:${L ? "grid;grid-template-columns:44% 56%;align-items:center;padding:0 110px 0 130px;gap:40px" : "flex;flex-direction:column;align-items:center;padding:210px 70px 0;gap:40px"}}
@keyframes show{0%{opacity:0}5%{opacity:1}95%{opacity:1}100%{opacity:0}}
.scene.center{display:grid;place-items:center;grid-template-columns:1fr;padding:0}
.vis{display:flex;justify-content:center;align-items:center;${L ? "" : "width:100%"}}

/* entrance helpers: all delayed by scene start + offset */
.up,.rise,.pop,.pop2,.zoom,.drop,.blip{animation-delay:calc(var(--s) + var(--o,0s));animation-fill-mode:both}
.up{animation-name:up;animation-duration:.7s;animation-timing-function:cubic-bezier(.2,.8,.2,1)}
@keyframes up{from{opacity:0;transform:translateY(34px)}to{opacity:1;transform:none}}
.rise{animation-name:rise;animation-duration:.9s;animation-timing-function:cubic-bezier(.2,.8,.2,1)}
@keyframes rise{from{opacity:0;transform:translateY(80px) scale(.94)}to{opacity:1;transform:none}}
.pop{animation-name:pop;animation-duration:.45s;animation-timing-function:cubic-bezier(.3,1.4,.6,1)}
@keyframes pop{0%{opacity:0;max-height:0;margin-top:0;transform:translateY(14px) scale(.9)}40%{max-height:600px}100%{opacity:1;max-height:600px;transform:none}}
.pop2{animation-name:pop2;animation-duration:.5s;animation-timing-function:cubic-bezier(.3,1.5,.6,1)}
@keyframes pop2{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
.zoom{animation-name:zoom;animation-duration:1s;animation-timing-function:cubic-bezier(.2,1.4,.4,1)}
@keyframes zoom{from{opacity:0;transform:scale(.3) rotate(-12deg)}to{opacity:1;transform:none}}
.drop{animation-name:drop;animation-duration:.6s;animation-timing-function:cubic-bezier(.2,1.3,.4,1)}
@keyframes drop{from{opacity:0;transform:translateY(-120px)}to{opacity:1;transform:none}}
.blip{animation-name:blip;animation-duration:var(--len);animation-timing-function:linear}
@keyframes blip{0%{opacity:0;max-height:0;margin-top:0}8%{opacity:1;max-height:80px;margin-top:12px}92%{opacity:1;max-height:80px;margin-top:12px}100%{opacity:0;max-height:0;margin-top:0;padding:0}}

/* copy */
.copy{${L ? "" : "text-align:center;max-width:940px"}}
.kicker{display:inline-block;font-weight:800;letter-spacing:.14em;text-transform:uppercase;font-size:${L ? 22 : 30}px;color:#a7f3d0;background:#ffffff14;border:1px solid #ffffff2a;padding:8px 18px;border-radius:99px;margin-bottom:${L ? 26 : 30}px}
.hl{font-weight:800;font-size:${L ? 76 : 88}px;line-height:1.08;letter-spacing:-.02em;text-wrap:balance}
.hl em{font-style:normal;color:#6ee7b7}
.sub{margin-top:26px;font-size:${L ? 30 : 36}px;line-height:1.4;color:#d1fae5;font-weight:500;text-wrap:balance}

/* phone */
.phone{position:relative;width:${L ? 470 : 590}px;height:${L ? 900 : 1010}px;border-radius:${L ? 56 : 72}px;background:#0b141a;padding:${L ? 14 : 18}px;
  box-shadow:0 0 0 3px #1f2c34,0 60px 120px -40px #000,0 0 120px -30px #10b98166;display:flex;flex-direction:column;overflow:hidden}
.notch{position:absolute;top:${L ? 22 : 28}px;left:50%;width:120px;height:30px;margin-left:-60px;border-radius:20px;background:#000;z-index:3}
.wa-head{display:flex;align-items:center;gap:14px;padding:${L ? "58px 18px 16px" : "74px 24px 20px"};background:#075e54;border-radius:${L ? 42 : 54}px ${L ? 42 : 54}px 0 0;font-size:${L ? 22 : 28}px}
.wa-head small{display:block;font-size:.7em;opacity:.8;font-weight:500}
.av{width:${L ? 50 : 64}px;height:${L ? 50 : 64}px;border-radius:50%;display:grid;place-items:center;background:#ec4899;font-weight:800;font-size:${L ? 20 : 26}px}
.chat{flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding:18px 18px 10px;background:#efeae2;
  background-image:radial-gradient(#00000012 1px,transparent 1.2px);background-size:18px 18px;overflow:hidden}
.b{max-width:86%;padding:12px 16px 8px;border-radius:16px;font-size:${L ? 22 : 27}px;line-height:1.38;color:#111b21;box-shadow:0 1px 1px #0000001a;margin-top:12px;overflow:hidden}
.b.in{align-self:flex-start;background:#fff;border-top-left-radius:4px}
.b.out{align-self:flex-end;background:#d9fdd3;border-top-right-radius:4px}
.b .t{display:block;text-align:right;font-size:.62em;color:#667781;margin-top:2px}
.typing{display:flex;gap:7px;padding:16px 18px;width:auto}
.typing i{width:11px;height:11px;border-radius:50%;background:#8696a0;animation:dot 1s infinite}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes dot{0%,60%,100%{transform:none;opacity:.5}30%{transform:translateY(-6px);opacity:1}}
.ai-tag{align-self:flex-end;margin-top:12px;background:#065f46;color:#fff;font-weight:700;font-size:${L ? 19 : 25}px;padding:8px 16px;border-radius:99px}
.day{align-self:center;background:#fff;color:#54656f;font-weight:700;font-size:${L ? 19 : 25}px;padding:6px 16px;border-radius:10px;margin-top:12px}
.invoice{min-width:72%}
.inv-h{font-weight:800;color:#047857;font-size:.8em;letter-spacing:.1em}
.inv-c{font-weight:800;font-size:1.05em;margin:2px 0 8px}
.inv-r{display:flex;justify-content:space-between;border-top:1px dashed #0002;border-bottom:1px dashed #0002;padding:6px 0}
.inv-p{font-size:.82em;color:#3b4a54;margin-top:6px}
.wa-input{display:flex;align-items:center;gap:12px;padding:12px 16px 18px;background:#efeae2;border-radius:0 0 ${L ? 42 : 54}px ${L ? 42 : 54}px}
.wa-input span{flex:1;background:#fff;border-radius:99px;padding:12px 20px;color:#8696a0;font-size:${L ? 20 : 26}px}
.wa-input i{width:${L ? 48 : 60}px;height:${L ? 48 : 60}px;border-radius:50%;background:#00a884}
.notif{position:absolute;left:${L ? 26 : 34}px;right:${L ? 26 : 34}px;top:${L ? 70 : 90}px;z-index:4;background:#fffffff2;color:#111;border-radius:24px;padding:18px 22px;box-shadow:0 30px 60px -20px #000c;font-size:${L ? 20 : 27}px}
.notif .nh{display:flex;align-items:center;gap:10px;font-size:.78em;color:#667781;font-weight:600;margin-bottom:6px}
.nlogo{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#34d399,#059669)}
.notif p{color:#3b4a54;margin-top:4px;line-height:1.35}

/* pile of notifications */
.pile{position:relative;display:flex;flex-direction:column;gap:0;width:${L ? 640 : 860}px}
.pn{display:flex;align-items:center;gap:18px;background:#fffffff0;color:#111b21;border-radius:24px;padding:16px 22px;margin-top:14px;box-shadow:0 20px 40px -20px #000a;font-size:${L ? 22 : 30}px;overflow:hidden}
.pn b{font-size:1em}.pn p{color:#54656f;font-size:.92em}
.pn>div{flex:1;min-width:0}
.pav{width:${L ? 52 : 68}px;height:${L ? 52 : 68}px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;background:var(--c);flex:none}
.pt{color:#00a884;font-weight:700;font-size:.75em}
.badge99{position:absolute;right:-30px;top:-30px;background:#ef4444;color:#fff;font-weight:800;font-size:${L ? 44 : 58}px;padding:12px 26px;border-radius:99px;box-shadow:0 20px 40px -10px #ef4444aa;transform-origin:center}

/* pains */
.pains{display:grid;grid-template-columns:${L ? "1fr 1fr" : "1fr"};gap:24px;width:${L ? 900 : 860}px}
.pain{display:flex;align-items:center;gap:20px;background:#ffffff14;border:1px solid #ffffff30;border-radius:28px;padding:${L ? "34px 30px" : "30px 34px"};font-size:${L ? 32 : 40}px;font-weight:700}
.pain span{font-size:1.6em}

/* intro & cta */
.intro,.cta{display:flex;flex-direction:column;align-items:center;text-align:center}
.biglogo{width:${L ? 190 : 230}px;height:${L ? 190 : 230}px;border-radius:${L ? 54 : 64}px;display:grid;place-items:center;background:linear-gradient(135deg,#34d399,#059669);box-shadow:0 40px 80px -30px #000,0 0 0 10px #ffffff12}
.biglogo svg{width:58%;height:58%}
.brandname{font-size:${L ? 120 : 130}px;font-weight:800;letter-spacing:-.03em;margin-top:40px}
.tagline{font-size:${L ? 46 : 56}px;font-weight:600;color:#d1fae5;margin-top:14px;line-height:1.3;max-width:${L ? 1300 : 900}px}
.tagline em{font-style:normal;color:#6ee7b7;font-weight:800}
.btn{margin-top:54px;background:#fff;color:#065f46;font-weight:800;font-size:${L ? 40 : 50}px;padding:${L ? "24px 52px" : "30px 56px"};border-radius:99px;box-shadow:0 30px 60px -20px #000}

/* laptop & setup & dash */
.laptop{width:${L ? 940 : 920}px;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 60px 120px -40px #000,0 0 0 3px #ffffff22}
.laptop .bar{display:flex;align-items:center;gap:9px;padding:14px 18px;background:#e9eef0}
.laptop .bar i{width:14px;height:14px;border-radius:50%;background:#f87171}.laptop .bar i:nth-child(2){background:#fbbf24}.laptop .bar i:nth-child(3){background:#34d399}
.laptop .bar span{margin-left:14px;font-size:16px;color:#64748b;background:#fff;padding:4px 18px;border-radius:8px}
.laptop img{display:block;width:100%}
.setup{display:flex;flex-direction:column;gap:30px;align-items:center}
.steps{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;max-width:${L ? 940 : 920}px}
.step{display:flex;align-items:center;gap:12px;background:#ffffff18;border:1px solid #ffffff33;padding:14px 22px;border-radius:99px;font-size:${L ? 25 : 32}px;font-weight:700}
.step b{display:grid;place-items:center;width:${L ? 40 : 50}px;height:${L ? 40 : 50}px;border-radius:50%;background:#fff;color:#065f46}
.step.done{background:#fff;color:#065f46}.step.done b{background:#10b981;color:#fff}
.dash{position:relative;${L ? "padding-right:120px" : "padding-bottom:220px"}}
.lap-dash{width:${L ? 940 : 900}px}
.mini-phone{position:absolute;${L ? "right:0;bottom:-60px;width:250px" : "right:20px;bottom:0;width:330px"};border-radius:34px;overflow:hidden;border:10px solid #0b141a;box-shadow:0 40px 80px -30px #000}
.mini-phone img{display:block;width:100%}
.chip{display:inline-block}
`;
};

function build(fmt, scenes) {
  let t = 0;
  const parts = [];
  const timeline = [];
  for (const [id, dur, [kicker, hl, sub], visual, narration, tts] of scenes) {
    const center = id === "intro" || id === "cta";
    const vis = visual(fmt);
    const copy = center ? "" : headline(kicker, hl, sub);
    parts.push(
      `<section class="scene ${center ? "center" : ""}" data-id="${id}" style="--s:${t}s;--d:${dur}s">${copy}<div class="vis">${vis}</div></section>`
    );
    timeline.push({ id, start: +t.toFixed(2), end: +(t + dur).toFixed(2), dur, narration, tts, onscreen: hl.replace(/<[^>]+>/g, "") });
    t += dur;
  }
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS(fmt)}</style></head><body><div class="bg"><div class="blob a"></div><div class="blob b"></div><div class="grain"></div></div>${parts.join("")}
<script>window.TOTAL=${t};</script></body></html>`;
  fs.writeFileSync(`${out}/${fmt}.html`, html);
  fs.writeFileSync(`${out}/${fmt}.timeline.json`, JSON.stringify({ total: t, scenes: timeline }, null, 2));
  console.log(fmt, "total", t, "s");
}

build("yt", YT);
build("tt", TT);
