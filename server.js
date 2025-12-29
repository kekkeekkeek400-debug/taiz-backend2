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


// =================== ADD SERVICE ===================
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
    res.status(500).json({ error: e.message });
  }
});

// =================== BOOK SERVICE ===================
app.post("/book", async (req, res) => {
  try {
    const { user_id, service_id, unit_id, start_date, end_date, people_count } = req.body;

    // تحقق من البيانات
    if (!user_id || !service_id || !start_date || !end_date || !people_count) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // 1) تحقق أن العميل موجود ومفعل
    const user = await pool.query(
      "SELECT id, is_active FROM users WHERE id=$1 AND role='client'",
      [user_id]
    );

    if (user.rowCount === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    if (!user.rows[0].is_active) {
      return res.status(403).json({ error: "Client not activated" });
    }

    // 2) تحقق أن الخدمة موجودة
    const service = await pool.query(
      "SELECT id, provider_id FROM services WHERE id=$1",
      [service_id]
    );

    if (service.rowCount === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    // 3) تحقق أن مزود الخدمة مفعل
    const provider = await pool.query(
      "SELECT id, is_active FROM users WHERE id=$1 AND role='provider'",
      [service.rows[0].provider_id]
    );

    if (provider.rowCount === 0 || !provider.rows[0].is_active) {
      return res.status(403).json({ error: "Provider not active" });
    }

    // 4) إذا كان هناك غرف (unit) تحقق منها
    if (unit_id) {
      const unit = await pool.query(
        "SELECT id FROM units WHERE id=$1 AND service_id=$2",
        [unit_id, service_id]
      );

      if (unit.rowCount === 0) {
        return res.status(404).json({ error: "Room not found" });
      }
    }

    // 5) إنشاء الحجز
    const booking = await pool.query(
      `INSERT INTO bookings 
       (user_id, service_id, unit_id, start_date, end_date, people_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [user_id, service_id, unit_id || null, start_date, end_date, people_count]
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



// =================== ADMIN APPROVE / REJECT ===================
app.post("/admin/booking-action", async (req, res) => {
  try {
    const { admin_code, booking_id, action } = req.body;

    if (!admin_code || !booking_id || !action) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (!["approved", "rejected"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const admin = await pool.query(
      "SELECT id FROM admins WHERE code=$1",
      [admin_code]
    );

    if (admin.rowCount === 0) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await pool.query(
      "UPDATE bookings SET status=$1 WHERE id=$2",
      [action, booking_id]
    );

    res.json({ success: true, status: action });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// =================== PROVIDER NOTIFICATIONS ===================
app.get("/provider/notifications/:provider_id", async (req, res) => {
  try {
    const { provider_id } = req.params;

    const r = await pool.query(`
      SELECT 
        b.id,
        b.start_date,
        b.end_date,
        b.people_count,
        u.full_name AS client_name,
        u.phone AS client_phone,
        s.name AS service_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN services s ON b.service_id = s.id
      WHERE s.provider_id = $1
      AND b.status = 'approved'
      ORDER BY b.start_date ASC
    `, [provider_id]);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =================== GET SERVICES ===================
app.get("/services", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        s.id, s.name, s.type, s.description, s.price,
        s.lat, s.lng,
        u.full_name AS provider_name
      FROM services s
      JOIN users u ON s.provider_id = u.id
      WHERE u.is_active = true
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =================== CLIENT BOOKINGS ===================
app.get("/client/bookings/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const r = await pool.query(`
      SELECT 
        b.id,
        b.start_date,
        b.end_date,
        b.status,
        s.name AS service_name
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.user_id = $1
      ORDER BY b.start_date DESC
    `, [user_id]);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/provider/bookings/:provider_id", async (req, res) => {
  const { provider_id } = req.params;

  const r = await pool.query(`
    SELECT 
      b.id,
      b.start_date,
      b.end_date,
      b.people_count,
      b.status,
      u.full_name AS client_name,
      s.name AS service_name
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN services s ON b.service_id = s.id
    WHERE s.provider_id = $1
    ORDER BY b.start_date DESC
  `, [provider_id]);

  res.json(r.rows);
});
// =================== CREATE PAYMENT ===================
app.post("/payments/create", async (req, res) => {
  try {
    const { booking_id, amount, payment_type } = req.body;

    if (!booking_id || !amount || !payment_type) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (!["kareemi", "onecash", "bank"].includes(payment_type)) {
      return res.status(400).json({ error: "Invalid payment type" });
    }

    const booking = await pool.query(
      "SELECT id, status FROM bookings WHERE id=$1",
      [booking_id]
    );

    if (booking.rowCount === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    await pool.query(
      `INSERT INTO payments (booking_id, amount, payment_type, confirmed)
       VALUES ($1,$2,$3,false)`,
      [booking_id, amount, payment_type]
    );

    res.json({
      success: true,
      message: "Send the amount to مؤسسة دلني وأحجز and upload receipt"
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =================== UPLOAD RECEIPT ===================
import multer from "multer";

const upload = multer({ dest: "uploads/" });

app.post("/payments/upload", upload.single("receipt"), async (req, res) => {
  try {
    const { payment_id } = req.body;

    if (!payment_id || !req.file) {
      return res.status(400).json({ error: "Missing receipt" });
    }

    await pool.query(
      "UPDATE payments SET receipt_image=$1 WHERE id=$2",
      [req.file.filename, payment_id]
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =================== ADMIN VIEW PAYMENTS ===================
app.get("/admin/payments", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        p.id,
        p.amount,
        p.payment_type,
        p.confirmed,
        b.id AS booking_id,
        u.full_name AS client
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN users u ON b.user_id = u.id
      ORDER BY p.id DESC
    `);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =================== ADMIN CONFIRM PAYMENT ===================
app.post("/admin/confirm-payment", async (req, res) => {
  try {
    const { admin_code, payment_id } = req.body;

    const admin = await pool.query(
      "SELECT id FROM admins WHERE code=$1",
      [admin_code]
    );

    if (admin.rowCount === 0) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const payment = await pool.query(
      "SELECT booking_id FROM payments WHERE id=$1",
      [payment_id]
    );

    await pool.query(
      "UPDATE payments SET confirmed=true WHERE id=$1",
      [payment_id]
    );

    await pool.query(
      "UPDATE bookings SET status='approved' WHERE id=$1",
      [payment.rows[0].booking_id]
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

app.get("/bookings/:id/pdf", async (req, res) => {
  try {
    const { id } = req.params;

    const r = await pool.query(`
      SELECT 
        b.id,
        b.start_date,
        b.end_date,
        b.people_count,
        u.full_name,
        u.phone,
        s.name AS service_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN services s ON b.service_id = s.id
      WHERE b.id = $1 AND b.status = 'approved'
    `, [id]);

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Booking not found or not approved" });
    }

    const booking = r.rows[0];

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=booking-${id}.pdf`);

    doc.pipe(res);

    doc.fontSize(20).text("مؤسسة دلني وأحجز", { align: "center" });
    doc.moveDown();
    doc.fontSize(16).text("قسيمة حجز", { align: "center" });

    doc.moveDown();
    doc.fontSize(12).text(`رقم الحجز: ${booking.id}`);
    doc.text(`العميل: ${booking.full_name}`);
    doc.text(`الهاتف: ${booking.phone}`);
    doc.text(`الخدمة: ${booking.service_name}`);
    doc.text(`من: ${booking.start_date}`);
    doc.text(`إلى: ${booking.end_date}`);
    doc.text(`عدد الأشخاص: ${booking.people_count}`);

    doc.moveDown();
    doc.text("يرجى إبراز هذه القسيمة عند الوصول");

    doc.end();

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =================== ADD ROOM / UNIT ===================
app.post("/provider/add-unit", async (req, res) => {
  try {
    const { provider_id, service_id, name, price, max_people } = req.body;

    const check = await pool.query(
      `SELECT s.id FROM services s
       WHERE s.id=$1 AND s.provider_id=$2`,
      [service_id, provider_id]
    );

    if (check.rowCount === 0) {
      return res.status(403).json({ error: "Not your service" });
    }

    const r = await pool.query(
      `INSERT INTO units (service_id, name, price, max_people)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [service_id, name, price, max_people]
    );

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =================== GET ROOMS ===================
app.get("/services/:id/units", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM units WHERE service_id=$1 AND is_available=true",
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =================== ADD REVIEW ===================
app.post("/reviews/add", async (req, res) => {
  try {
    const { user_id, service_id, rating, comment } = req.body;

    // تأكد أن المستخدم مفعل
    const user = await pool.query(
      "SELECT is_active FROM users WHERE id=$1",
      [user_id]
    );

    if (user.rowCount === 0 || !user.rows[0].is_active) {
      return res.status(403).json({ error: "User not active" });
    }

    const r = await pool.query(
      `INSERT INTO reviews (user_id, service_id, rating, comment)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [user_id, service_id, rating, comment]
    );

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =================== GET REVIEWS ===================
app.get("/services/:id/reviews", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        r.rating,
        r.comment,
        r.created_at,
        u.full_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.service_id = $1
      ORDER BY r.created_at DESC
    `, [req.params.id]);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =================== TOP RATED ===================
app.get("/services/top-rated", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        s.*,
        AVG(r.rating) AS rating,
        COUNT(r.id) AS reviews
      FROM services s
      JOIN reviews r ON s.id = r.service_id
      GROUP BY s.id
      ORDER BY rating DESC
      LIMIT 10
    `);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// =================== SERVICES NEAR ME ===================
app.get("/services/near", async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: "lat and lng required" });
    }

    const r = await pool.query(`
      SELECT *,
      ( 6371 * acos(
        cos(radians($1)) * cos(radians(lat)) *
        cos(radians(lng) - radians($2)) +
        sin(radians($1)) * sin(radians(lat))
      )) AS distance
      FROM services
      ORDER BY distance
      LIMIT 30
    `, [lat, lng]);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =================== START ===================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
