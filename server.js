import express from "express";
import pkg from "pg";
import cors from "cors";

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});


// =================== TEST PAGE ===================
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: document.getElementById("name").value,
      phone: document.getElementById("phone").value,
      role: role
    })
  });

  const txt = await res.text();
  document.getElementById("out").textContent = txt;
}
</script>
    </body>
    </html>
  `);
});

// =================== BASIC ===================
app.get("/", (req, res) => {
  res.send("Taiz backend is running 🚀");
});

app.get("/db", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW()");
    res.json({ database_time: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =================== REGISTER ===================
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
    res.status(400).json({ error: e.message });
  }
});


// =================== ADMIN CREATE CODE ===================
app.post("/admin/create-code", async (req, res) => {
  try {
    const { admin_code, user_id } = req.body;

    const admin = await pool.query(
      "SELECT * FROM admins WHERE code=$1",
      [admin_code]
    );

    if (admin.rowCount === 0) {
      return res.status(401).json({ error: "Invalid admin code" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      `INSERT INTO activation_codes (user_id, code, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
      [user_id, code]
    );

    res.json({ code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// =================== ACTIVATE ACCOUNT ===================
app.post("/activate", async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: "Phone and code required" });
    }

    const userRes = await pool.query(
      "SELECT id, is_active FROM users WHERE phone = $1",
      [phone]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userRes.rows[0];

    if (user.is_active) {
      return res.status(400).json({ error: "User already activated" });
    }

    const codeRes = await pool.query(
      `SELECT id FROM activation_codes
       WHERE user_id = $1
       AND code = $2
       AND used = false
       AND expires_at > NOW()`,
      [user.id, code]
    );

    if (codeRes.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    await pool.query(
      "UPDATE users SET is_active = true WHERE id = $1",
      [user.id]
    );

    await pool.query(
      "UPDATE activation_codes SET used = true WHERE id = $1",
      [codeRes.rows[0].id]
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// إضافة خدمة (فندق / مطعم / مستشفى)
app.post("/provider/add-service", async (req, res) => {
  try {
    const {
      provider_id,
      name,
      type,
      description,
      price,
      lat,
      lng,
      available_days,
      open_time,
      close_time
    } = req.body;

    if (!provider_id || !name || !price) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // تحقق أن المستخدم مزود خدمة ومفعل
    const provider = await pool.query(
      "SELECT * FROM users WHERE id=$1 AND role='provider' AND is_active=true",
      [provider_id]
    );

    if (provider.rowCount === 0) {
      return res.status(403).json({ error: "Provider not authorized" });
    }

    const result = await pool.query(
      `INSERT INTO services 
      (provider_id, name, type, description, price, lat, lng, available_days, open_time, close_time)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        provider_id,
        name,
        type,
        description,
        price,
        lat,
        lng,
        available_days,
        open_time,
        close_time
      ]
    );

    res.json(result.rows[0]);

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});
// =================== BOOK SERVICE ===================
app.post("/book", async (req, res) => {
  try {
    const { user_id, service_id, date, time } = req.body;

    if (!user_id || !service_id || !date || !time) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // 1. تأكد أن العميل موجود ومفعل
    const user = await pool.query(
      "SELECT id, is_active FROM users WHERE id=$1 AND role='user'",
      [user_id]
    );

    if (user.rowCount === 0) {
      return res.status(404).json({ error: "user not found" });
    }

    if (!user.rows[0].is_active) {
      return res.status(403).json({ error: "user not activated" });
    }

    // 2. تأكد أن الخدمة موجودة
    const service = await pool.query(
      "SELECT id, provider_id FROM services WHERE id=$1",
      [service_id]
    );

    if (service.rowCount === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    // 3. تأكد أن مزود الخدمة مفعل
    const provider = await pool.query(
      "SELECT id, is_active FROM users WHERE id=$1 AND role='provider'",
      [service.rows[0].provider_id]
    );

    if (provider.rowCount === 0 || !provider.rows[0].is_active) {
      return res.status(403).json({ error: "Provider not active" });
    }

    // 4. إنشاء الحجز
    const booking = await pool.query(
      `INSERT INTO bookings (client_id, service_id, booking_date, booking_time)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [user_id, service_id, date, time]
    );

    res.json({
      success: true,
      booking: booking.rows[0]
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// =================== START ===================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
