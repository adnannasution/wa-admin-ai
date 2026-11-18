import Anthropic from "@anthropic-ai/sdk";
import { activeProducts, createOrder, recentMessages, ORDER_STATUSES } from "./db.js";
import { rupiah } from "./fonnte.js";

const MAX_TOOL_ROUNDS = 5;

let defaultClient;
function getClient() {
  defaultClient ??= new Anthropic();
  return defaultClient;
}

const TOOLS = [
  {
    name: "buat_pesanan",
    description:
      "Buat pesanan baru setelah pelanggan MENGONFIRMASI produk, jumlah, nama, dan alamat pengiriman. " +
      "Jangan panggil sebelum pelanggan setuju dengan ringkasan pesanan.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["nama_pelanggan", "alamat", "items", "catatan"],
      properties: {
        nama_pelanggan: { type: "string" },
        alamat: { type: "string", description: "Alamat pengiriman lengkap" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["produk_id", "jumlah"],
            properties: {
              produk_id: { type: "integer", description: "id produk dari katalog" },
              jumlah: { type: "integer" },
            },
          },
        },
        catatan: { type: "string", description: "Catatan tambahan, isi string kosong jika tidak ada" },
      },
    },
  },
  {
    name: "cek_pesanan",
    description: "Lihat status pesanan-pesanan terakhir milik pelanggan ini.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: [], properties: {} },
  },
  {
    name: "panggil_admin",
    description:
      "Serahkan percakapan ke admin manusia: komplain, retur/refund, nego harga, pertanyaan yang tidak bisa " +
      "dijawab dari info toko, atau pelanggan minta bicara dengan orang.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["alasan"],
      properties: { alasan: { type: "string" } },
    },
  },
];

export function buildSystemPrompt(tenant, products) {
  const catalog = products.length
    ? products
        .map(
          (p) =>
            `- id ${p.id}: ${p.name} — ${rupiah(p.price)}` +
            (p.stock === null ? "" : p.stock > 0 ? ` (stok ${p.stock})` : " (HABIS)") +
            (p.description ? ` — ${p.description}` : "")
        )
        .join("\n")
    : "(katalog kosong)";

  return `Kamu adalah admin WhatsApp toko "${tenant.name}". Balas pelanggan dalam bahasa Indonesia yang ramah, singkat, dan natural seperti admin toko online.

Aturan:
- Jawab hanya berdasarkan info toko dan katalog di bawah. Jangan mengarang produk, harga, stok, ongkir, atau promo.
- Untuk memesan, kumpulkan: produk & jumlah, nama, alamat lengkap. Kirim ringkasan + total, lalu tunggu pelanggan bilang setuju sebelum memanggil buat_pesanan.
- Setelah pesanan dibuat, kirim kode invoice, total, dan cara pembayaran.
- Jika di luar kemampuanmu (komplain, retur, nego, ongkir yang tidak tercantum), panggil panggil_admin dan bilang admin akan segera membalas.
- Format WhatsApp: *tebal*, _miring_, daftar pakai "- ". Jangan pakai markdown lain (tanpa #, tanpa tabel). Maksimal sekitar 6 baris kecuali ringkasan pesanan.

Info toko:
${tenant.store_info || "(belum diisi)"}

Cara pembayaran:
${tenant.payment_info || "(belum diisi — minta pelanggan menunggu info dari admin)"}

Katalog:
${catalog}`;
}

/** Converts stored chat rows into Messages API turns (first turn must be user). */
export function historyToMessages(rows) {
  const msgs = [];
  for (const r of rows) {
    const role = r.role === "user" ? "user" : "assistant"; // admin replies count as the shop's side
    const prev = msgs[msgs.length - 1];
    if (prev && prev.role === role) prev.content += "\n" + r.content;
    else msgs.push({ role, content: r.content });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

function runTool(db, tenant, contact, name, input, effects) {
  if (name === "buat_pesanan") {
    const order = createOrder(db, {
      tenantId: tenant.id,
      contactId: contact.id,
      customerName: input.nama_pelanggan,
      address: input.alamat,
      items: input.items,
      note: input.catatan,
    });
    effects.ordersCreated.push(order.code);
    return {
      kode: order.code,
      total: rupiah(order.total),
      rincian: order.lines.map((l) => `${l.qty}x ${l.name} @${rupiah(l.price)}`),
      cara_bayar: tenant.payment_info || "Admin akan mengirim info pembayaran.",
    };
  }
  if (name === "cek_pesanan") {
    const rows = db
      .prepare("SELECT code, total, status, created_at FROM orders WHERE contact_id = ? ORDER BY id DESC LIMIT 5")
      .all(contact.id);
    return rows.length
      ? rows.map((o) => ({ kode: o.code, total: rupiah(o.total), status: ORDER_STATUSES[o.status], tanggal: o.created_at }))
      : "Pelanggan ini belum punya pesanan.";
  }
  if (name === "panggil_admin") {
    effects.handoff = input.alasan;
    return "Admin sudah diberi tahu. Sampaikan ke pelanggan bahwa admin akan segera membalas.";
  }
  throw new Error(`Tool tidak dikenal: ${name}`);
}

/**
 * Generates the shop's reply for a contact's latest messages.
 * Returns { text, ordersCreated, handoff }.
 */
export async function generateReply(db, tenant, contact, { client = getClient() } = {}) {
  const system = buildSystemPrompt(tenant, activeProducts(db, tenant.id));
  const messages = historyToMessages(recentMessages(db, contact.id, 20));
  const effects = { ordersCreated: [], handoff: null };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: process.env.CLAUDE_EFFORT || "low" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { text: "Mohon tunggu sebentar ya kak, admin kami akan membalas.", ...effects, handoff: "AI menolak menjawab" };
    }

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text, ...effects };
    }

    // Keep every block (thinking included) so the tool loop stays valid.
    messages.push({ role: "assistant", content: response.content });
    const results = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        const out = runTool(db, tenant, contact, block.name, block.input, effects);
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: e.message, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "Mohon tunggu sebentar ya kak, admin kami akan membalas.", ...effects, handoff: effects.handoff || "Terlalu banyak langkah" };
}
