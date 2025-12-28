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
      <h2>اختر نوع الحساب</h2>
      <button onclick="setRole('client')">عميل</button>
      <button onclick="setRole('provider')">مزود خدمة</button>

      <div id="form" style="display:none; margin-top:20px;">
        <h3 id="title"></h3>
        <input id="name" placeholder="الاسم الكامل"/><br><br>
        <input id="phone" placeholder="رقم الهاتف"/><br><br>
        <button onclick="register()">تسجيل</button>
        <pre id="out"></pre>
      </div>

      <script>
        let role = "";

        function setRole(r) {
          role = r;
          document.getElementById("form").style.display = "block";
          document.getElementById("title").innerText = 
            r === "client" ? "تسجيل عميل" : "تسجيل مزود خدمة";
        }

        async function register() {
          const res = await fetch("/register", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
              full_name: name.value,
              phone: phone.value,
              role
            })
          });
          out.textContent = await res.text();
        }
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
