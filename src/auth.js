import crypto from "node:crypto";

const SECRET = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET wajib diisi (minimal 16 karakter).");
  return s;
};

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, "hex"));
}

function sign(value) {
  return crypto.createHmac("sha256", SECRET()).update(value).digest("base64url");
}

export function makeSessionCookie(tenantId) {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  const value = `${tenantId}.${exp}`;
  return `${value}.${sign(value)}`;
}

export function readSession(cookieHeader) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader || "");
  if (!m) return null;
  const [id, exp, sig] = decodeURIComponent(m[1]).split(".");
  if (!id || !exp || !sig) return null;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(id);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 3600 * 1000,
  };
}
