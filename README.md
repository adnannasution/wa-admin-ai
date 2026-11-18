# WA Admin AI

Admin WhatsApp otomatis untuk UMKM. Pelanggan chat ke nomor toko, AI (Claude) yang membalas: menjawab pertanyaan produk, mencatat pesanan, mengirim info pembayaran, dan mengingatkan pelanggan yang belum bayar. WhatsApp-nya lewat **[Fonnte](https://fonnte.com)**.

## Fitur MVP
- **Auto-reply AI**: hanya menjawab dari katalog dan info toko, tidak mengarang harga.
- **Pesanan otomatis**: AI merangkum pesanan, minta konfirmasi, lalu membuat invoice (`INVyymmdd-XXXX`). Stok berkurang otomatis.
- **Serah ke admin**: komplain, retur, atau nego membuat AI berhenti untuk kontak itu, dan pemilik toko dapat notifikasi WA.
- **Inbox percakapan**: lihat chat, balas sebagai admin, jeda atau aktifkan AI per kontak.
- **Status pesanan**: Menunggu bayar → Dibayar → Dikirim (dengan resi) → Selesai / Batal. Pelanggan dikabari otomatis lewat WA.
- **Pengingat pembayaran**: dikirim otomatis setiap 6 jam, maksimal 2 kali (bisa diatur).
- **Export CSV** pesanan, bisa langsung dibuka di Excel atau Google Sheets.
- **Multi-toko (SaaS)**: tiap toko punya akun sendiri. Nomor WA disambungkan oleh admin platform lewat akun Fonnte milik platform.

## Menjalankan lokal
Butuh Node.js ≥ 22.13. Database memakai SQLite bawaan Node, tanpa instalasi tambahan.

```bash
cp .env.example .env    # isi SESSION_SECRET dan ANTHROPIC_API_KEY
npm install
npm run dev             # http://localhost:3000
npm test
```

Fonnte harus bisa menjangkau webhook, jadi untuk tes lokal pakai tunnel (misalnya `cloudflared tunnel --url http://localhost:3000`) dan isi `PUBLIC_URL` dengan URL tunnel itu.

## Model layanan: akun Fonnte milik platform
Pedagang **tidak perlu punya akun Fonnte**. Semua nomor WA toko disambungkan sebagai device di akun Fonnte milik platform, dan biayanya sudah termasuk dalam harga paket. Setiap toko tetap memakai nomor WA-nya sendiri.

**Alur pedagang:**
1. Daftar, lalu isi **nomor WA toko**, **nomor WA pemilik** (harus beda), info toko, dan cara bayar di Pengaturan.
2. Tunggu QR dari tim kita, lalu scan dari WhatsApp nomor toko → Perangkat tertaut → Tautkan perangkat.
3. Dashboard menampilkan "✅ WhatsApp tersambung".

**Alur admin platform** (email terdaftar di `SUPERADMIN_EMAILS` → menu **Admin Platform** / `/admin`):
1. Lihat toko yang statusnya **Belum** tersambung.
2. Di Fonnte: Add device dengan nomor toko, Connect, lalu kirim QR ke pemilik.
3. Isi Webhook device dengan URL yang tertera di halaman toko (`/admin/toko/:id`).
4. Tempel token device ke halaman toko, simpan, lalu klik **Tes kirim WA**.
5. Untuk menangguhkan toko (misalnya belum bayar), hapus centang **Akun aktif**. AI berhenti membalas dan pengingat bayar berhenti.

Token Fonnte tidak pernah ditampilkan ke pedagang.

## Supaya AI tidak dobel membalas
- **Perintah dari nomor pemilik** ke nomor toko: `#stop 0812xxx`, `#start 0812xxx`, `#stop semua`, `#start semua`, `#status`. Pesan dari nomor pemilik tidak pernah dijawab AI sebagai pelanggan.
- **Membalas dari dashboard**: AI otomatis diam selama `AI_PAUSE_MINUTES` (default 60 menit) untuk chat itu, lalu aktif lagi.
- **Eskalasi** (komplain dan sejenisnya): AI berhenti untuk kontak itu sampai dinyalakan lagi.

Catatan: belum dicek apakah Fonnte meneruskan pesan yang diketik pemilik langsung dari HP ke webhook. Karena itu pemilik yang membalas dari HP perlu memakai `#stop`.

## Deploy (Railway)
- Buat service dari repo ini. `railway.json` sudah menyetel `npm start` dan healthcheck `/health`.
- Tambahkan **Volume** yang di-mount ke `/app/data` supaya database tidak hilang saat redeploy, lalu set `DATABASE_PATH=/app/data/app.db`.
- Set variabel `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `PUBLIC_URL`, `SUPERADMIN_EMAILS`, dan `NODE_ENV=production`.

## Biaya AI
Default model `claude-opus-5-5` dengan effort `low`. Prompt sistem (info toko + katalog) di-cache supaya chat berikutnya lebih murah. Untuk menekan biaya, set `CLAUDE_MODEL=claude-haiku-5-5`, tapi uji dulu kualitas balasannya. Jika model menolak menjawab, API otomatis mencoba model cadangan (`fallbacks: "default"`).

## Struktur
```
src/server.js     entry point + jadwal pengingat
src/app.js        route dashboard & webhook
src/bot.js        alur pesan masuk (antrian per kontak, handoff)
src/ai.js         prompt + tools Claude (buat_pesanan, cek_pesanan, panggil_admin)
src/fonnte.js     kirim WA & parsing webhook
src/db.js         skema SQLite + logika pesanan/stok
src/reminders.js  pengingat pembayaran
src/views.js      HTML dashboard
```

## Ide lanjutan
- Payment gateway (Midtrans/Xendit QRIS) agar status "Dibayar" otomatis
- Baca bukti transfer (gambar) dengan vision
- Broadcast promo ke pelanggan lama
- Paket langganan + billing per toko
