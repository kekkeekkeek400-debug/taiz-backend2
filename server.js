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
app.get("/test", (req, res) => {
  res.send(`
    <html>
    <body style="font-family:sans-serif; padding:40px;">
      <h2>Taiz Registration Test</h2>
      <form id="f">
        <input placeholder="Full name" id="name"/><br><br>
        <input placeholder="Phone" id="phone"/><br><br>
         
        <select id="role">
          <option value="provider">مزود خدمة</option>
          <option value="client">عميل</option>

        </select><br><br>
        <button type="submit">Send</button>
      </form>
      <pre id="out"></pre>

      <script>
  document.getElementById("f").onsubmit = async (e) => {
    e.preventDefault();

    const full_name = document.getElementById("name").value;
    const phone = document.getElementById("phone").value;
    const city = document.getElementById("city").value;
    const role = document.getElementById("role").value;

    const res = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
  full_name: name.value,
  phone: phone.value,
  role: role.value
})

    document.getElementById("out").textContent = await res.text();
  };
     </script>

    </body>
    </html>
  `);
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
    const { full_name, phone, role } = req.body;

    const city = "تعز";

    if (!full_name || !phone || !role) {
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
