import express from "express";
import pkg from "pg";
import cors from "cors";

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());

// اتصال قاعدة البيانات (سيأتي من Railway لاحقًا)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// اختبار أن السيرفر يعمل
app.get("/", (req, res) => {
  res.send("Taiz backend is running 🚀");
});
// اختبار الاتصال بقاعدة البيانات
app.get("/db", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW()");
    res.json({ database_time: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// تسجيل مستخدم (عميل أو مزود)
app.post("/register", async (req, res) => {
  try {
    const { full_name, phone, city, role } = req.body;

    if (!full_name || !phone || !city || !role) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const result = await pool.query(
      `INSERT INTO users (full_name, phone, city, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [full_name, phone, city, role]
    );

    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

// تشغيل السيرفر (Railway سيعطي PORT)
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
