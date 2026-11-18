import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { sendPaymentReminders } from "./reminders.js";

// Load .env if present (Node >= 20.12)
try {
  process.loadEnvFile();
} catch {}

const db = openDb();
const app = createApp(db);
const port = Number(process.env.PORT || 3000);

app.listen(port, () => console.log(`WA Admin AI jalan di http://localhost:${port}`));

const every = 15 * 60 * 1000;
setInterval(() => sendPaymentReminders(db).catch((e) => console.error("Reminder error:", e)), every);
