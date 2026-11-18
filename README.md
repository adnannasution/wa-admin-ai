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
- **Multi-toko (SaaS)**: tiap toko punya akun, token Fonnte, dan URL webhook sendiri.

## Menjalankan lokal
Butuh Node.js ≥ 22.13. Database memakai SQLite bawaan Node, tanpa instalasi tambahan.

```bash
cp .env.example .env    # isi SESSION_SECRET dan ANTHROPIC_API_KEY
npm install
npm run dev             # http://localhost:3000
npm test
```

Fonnte harus bisa menjangkau webhook, jadi untuk tes lokal pakai tunnel (misalnya `cloudflared tunnel --url http://localhost:3000`) dan isi `PUBLIC_URL` dengan URL tunnel itu.

## Menyambungkan Fonnte
1. Daftar toko di aplikasi, lalu buka **Pengaturan**.
2. Isi **token device** dari dashboard Fonnte (menu Device → token), info toko, cara pembayaran, dan nomor WA pemilik.
3. Salin **URL webhook** di Dashboard (`https://domainmu/webhook/<kunci-rahasia>`).
4. Di Fonnte: Device → Edit → kolom **Webhook**, tempel URL tadi, lalu simpan.
5. Kirim chat ke nomor toko dari HP lain untuk mencoba.

Pesan grup diabaikan. URL webhook mengandung kunci acak, jadi jangan dibagikan.

## Deploy (Railway)
- Buat service dari repo ini. `railway.json` sudah menyetel `npm start` dan healthcheck `/health`.
- Tambahkan **Volume** yang di-mount ke `/app/data` supaya database tidak hilang saat redeploy, lalu set `DATABASE_PATH=/app/data/app.db`.
- Set variabel `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `PUBLIC_URL`, dan `NODE_ENV=production`.

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
