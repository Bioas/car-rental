# 🚗 ระบบบริหารจัดการยานพาหนะ (Car Rental Management System)

ระบบจองรถยนต์สำหรับองค์กร — พนักงานสามารถดูรถว่าง จองรถ และติดตามสถานะได้ผ่านหน้าเว็บ ส่วนผู้ดูแลระบบสามารถจัดการรถยนต์ อนุมัติ/ปฏิเสธคำขอ ดูรายงาน และจัดการผู้ใช้ได้ทั้งหมด

> สร้างด้วย **React + Vite + Tailwind CSS** (Frontend) และ **Express** (Backend) — ภาษาไทยทั้งระบบ 🇹🇭
>
> ฐานข้อมูล: **MongoDB** — ใช้ MongoDB Atlas บน production หรือ mongod ในเครื่องสำหรับพัฒนา (ดูรายละเอียดที่หัวข้อ [ฐานข้อมูล](#-ฐานข้อมูล))

---

## ✨ Features

### 👤 สำหรับพนักงาน (Public)
- 🔍 ดูรายการรถว่างและจองได้ทันทีผ่านหน้าสาธารณะ
- 📅 ปฏิทินแสดงการจอง — เห็นว่าใครจองรถคันไหน วันไหนบ้าง (แยกสีตามผู้ใช้)
- 📋 ติดตามสถานะคำขอจองของตัวเอง (รออนุมัติ / อนุมัติแล้ว / ปฏิเสธ / คืนแล้ว)
- 🔔 ระบบแจ้งเตือนเมื่อสถานะเปลี่ยน

### 🛠️ สำหรับ Admin (หลังบ้าน)
- 📊 **Dashboard** — สรุปสถิติรถยนต์, การใช้งานวันนี้, คำขอที่รออนุมัติ
- 📋 **จัดการคำขอจอง** — ดูรายการคำขอ, อนุมัติ/ปฏิเสธ/คืนรถ, พร้อม **ปฏิทิน** ในตัว (สลับระหว่าง List View และ Calendar View)
- 🚙 **จัดการรถยนต์** — เพิ่ม/แก้ไข/เปลี่ยนสถานะ (พร้อมใช้, จอง, ซ่อมบำรุง, ปลดระวาง)
- 👥 **จัดการผู้ใช้** — ดูรายชื่อ, เปลี่ยน role, ดูประวัติการจอง
- 📈 **รายงาน** — สถิติการใช้งานรายเดือน, จำนวนการจอง, อัตราการใช้งาน

---

## 🔐 บัญชีทดสอบ

รัน `npm run seed` เพื่อสร้างบัญชีเหล่านี้ (เป็น idempotent — รันซ้ำได้ไม่พัง)

| Role  | Email                    | Password  |
|-------|--------------------------|-----------|
| Admin | admin@carrental.local    | admin123  |
| User  | somchai@carrental.local  | user123   |
| User  | nantipat44@gmail.com     | 123456    |

---

## 🚀 การติดตั้งและรัน

### 1. ติดตั้ง dependencies

```bash
# ติดตั้ง dependencies ทั้ง frontend และ backend
npm install
```

### 2. สร้างฐานข้อมูลและ seed ข้อมูลทดสอบ

```bash
npm run seed
```

> ฐานข้อมูลจะถูกสร้างอัตโนมัติเมื่อเริ่ม server ครั้งแรก (admin + user + รถตัวอย่าง) — `npm run seed` ช่วยการันตีว่าบัญชีทดสอบด้านบนมีอยู่จริง และรันซ้ำได้อย่างปลอดภัย

### 3. รัน development server

```bash
# รันทั้ง frontend (Vite) และ backend (Express) พร้อมกัน
npm run dev:all
```

หรือแยกรันทีละตัว:
```bash
# Terminal 1 — Backend API ที่ port 3000
npm run dev:server

# Terminal 2 — Frontend Vite ที่ port 5173
npm run dev
```

### 4. เปิดเบราว์เซอร์

- **หน้า public**: http://localhost:5173
- **หน้า login admin**: http://localhost:5173/login

---

## 🏗️ โครงสร้างโปรเจค

```
car-rental/
├── api/                    # Backend (Express)
│   ├── index.js            # Serverless entry (Vercel)
│   ├── server.cjs         # Express app + dev server
│   ├── db.cjs             # MongoDB data layer (connect/CRUD/index/seed/lock)
│   ├── lib/
│   │   ├── dates.cjs      # today()/isValidDate() ตามเวลาเครื่อง
│   │   ├── pagination.cjs # page/limit → { total, pages }
│   │   └── http-error.cjs # httpError()/sendError()
│   ├── __tests__/         # ชุดเทสต์ (vitest + supertest)
│   ├── seed.cjs           # Seed ข้อมูลทดสอบ (npm run seed)
│   ├── sse.cjs            # Server-Sent Events client manager
│   ├── middleware/
│   │   └── auth.cjs       # JWT authentication
│   └── routes/
│       ├── auth.cjs       # Login/Register/Me
│       ├── bookings.cjs   # Booking CRUD
│       ├── cars.cjs       # Car management
│       ├── admin.cjs      # Admin endpoints
│       ├── notifications.cjs # Notification system
│       └── public.cjs     # Public endpoints
├── src/                    # Frontend (React + Vite)
│   ├── App.jsx             # Main router
│   ├── main.jsx            # Entry point
│   ├── context/
│   │   └── AppContext.jsx  # Global state + auth
│   ├── components/
│   │   ├── AppLayout.jsx   # Shell layout
│   │   ├── Navbar.jsx      # Top nav
│   │   ├── Sidebar.jsx     # Side navigation
│   │   ├── BookingModal.jsx # Booking creation modal
│   │   ├── ErrorBoundary.jsx # กันหน้าจอขาวเมื่อ render พัง
│   │   └── ui/             # Reusable UI components (รวม pager.jsx)
│   ├── pages/
│   │   ├── PublicBooking.jsx  # Public landing
│   │   ├── Dashboard.jsx      # Admin dashboard
│   │   ├── CalendarPage.jsx   # Calendar view
│   │   ├── Bookings.jsx       # User booking history
│   │   ├── Notifications.jsx  # Notification center
│   │   ├── auth/
│   │   │   └── Login.jsx      # Login page
│   │   └── admin/
│   │       ├── BookingsManage.jsx  # Booking management
│   │       ├── CarsManage.jsx      # Car CRUD
│   │       ├── UsersManage.jsx     # User management
│   │       └── Reports.jsx         # Reports & stats
│   ├── lib/
│   │   └── constants.js    # Status labels, colors
│   └── styles/
│       └── globals.css     # Tailwind + custom styles
├── eslint.config.mjs       # Linter (npm run lint)
├── vitest.config.ts        # Test runner (npm test)
├── tailwind.config.js
├── vite.config.ts
└── package.json
```

---

## 🔑 Environment Variables

| Variable            | จำเป็น                    | คำอธิบาย                                                                                       |
|---------------------|---------------------------|--------------------------------------------------------------------------------------------------|
| `JWT_SECRET`        | ✅ production              | คีย์สำหรับเซ็น/ตรวจ JWT — ต้องยาว ≥ 16 ตัวอักษร ถ้าไม่ตั้งบน production เซิร์ฟเวอร์จะไม่เริ่มทำงาน |
| `MONGODB_URI`       | ✅ production              | connection string ของ MongoDB (เช่น `mongodb+srv://…` จาก Atlas)                                 |
| `MONGODB_DB`        | ❌ (default car-rental)   | ชื่อฐานข้อมูล                                                                                     |
| `SSE_REVALIDATE_MS` | ❌ (default 15000)         | ทุกกี่ ms ที่ stream แบบเรียลไทม์จะตรวจ token กับฐานข้อมูลซ้ำ                                      |
| `SSE_KEEPALIVE_MS`  | ❌ (default 30000)         | ทุกกี่ ms ที่ส่ง keep-alive บน stream ที่เปิดอยู่                                                 |
| `PORT`              | ❌ (default 3000)          | พอร์ตของ backend                                                                                  |

คัดลอกจาก `.env.example` แล้วใส่ค่าจริง:

```bash
cp .env.example .env
```

ไฟล์ `.env` จะถูกโหลดอัตโนมัติเมื่อรัน API และ `npm run seed` และ **ตัวแปร environment จริงจะชนะค่าจากไฟล์เสมอ** — บน Vercel ให้ตั้งค่าที่ Project Settings → Environment Variables

## 🛠️ Tech Stack

| Layer    | Technology                                      |
|----------|-------------------------------------------------|
| Frontend | React 18, React Router 6, Tailwind CSS 3, Vite 6 |
| Calendar | FullCalendar 6                                  |
| Charts   | Chart.js + react-chartjs-2                      |
| Backend  | Express 5                                       |
| Database | MongoDB (mongodb driver v6)                     |
| Auth     | JWT (jsonwebtoken) + bcryptjs                   |

---

## 📦 Scripts

| Command             | Description                         |
|---------------------|-------------------------------------|
| `npm run dev`       | รัน Vite dev server (frontend)      |
| `npm run dev:server`| รัน Express server (backend)        |
| `npm run dev:all`   | รันทั้ง frontend + backend พร้อมกัน |
| `npm run build`     | Build production                    |
| `npm run seed`      | Seed ข้อมูลทดสอบลงฐานข้อมูล         |
| `npm run preview`   | Preview production build            |
| `npm test`          | รันชุดเทสต์ทั้งหมด (MongoDB)        |
| `npm run lint`      | ตรวจโค้ดด้วย ESLint                 |

---

---

## 🗄️ ฐานข้อมูล

ระบบใช้ **MongoDB** — เชื่อมต่อผ่าน `MONGODB_URI` (Atlas บน production, mongod ในเครื่องสำหรับ dev)
ต่างจาก SQLite ตรงที่เป็นเซิร์ฟเวอร์ฐานข้อมูลแยก ไม่มีไฟล์ที่ต้องเขียนลงดิสก์ จึงทำงานบนโฮสต์แบบ serverless อย่าง Vercel ได้โดยข้อมูลไม่หาย

- คอลเลกชัน: `users`, `cars`, `bookings`, `notifications` (มี unique index ที่ `users.email` และ `cars.license_plate`)
- ถ้าฐานข้อมูลว่าง ระบบจะ seed บัญชีและรถตัวอย่างให้อัตโนมัติเมื่อ init ครั้งแรก และ `npm run seed` ยังรันซ้ำได้อย่างปลอดภัย

สิ่งที่รับประกันได้:

- **จองพร้อมกันไม่ได้รถคันเดียวกัน** — งานเขียนต่อรถคันเดียวกันถูกจัดคิว (mutex ในโปรเซส) แล้วเช็กวันทับซ้อนก่อน insert คำขอที่แพ้จะได้ `409`
- **อนุมัติ/ปฏิเสธ/คืนรถ เป็นการเปลี่ยนสถานะครั้งเดียว** — `UPDATE … WHERE status = 'expected'` ถ้าแถวถูกแก้ไปแล้วจะได้ `409` แทนการเขียนทับ
- **แก้รหัสผ่าน / เปลี่ยน role / ลบผู้ใช้ = token เดิมใช้ไม่ได้ทันที** (ผ่าน `token_version`)
- **stream เรียลไทม์ตรวจ token ซ้ำทุก 15 วินาที** — เซสชันที่ถูกยกเลิกจะถูกตัดและแจ้ง `session-expired` ให้หน้าเว็บ logout

### รันชุดเทสต์

```bash
npm test        # 60 เทสต์: auth, cars, bookings, admin, public, concurrency, SSE, data layer
npm run lint    # ESLint
```

เทสต์ต้องใช้ MongoDB จริง — ตั้ง `MONGODB_URI` (หรือ `TEST_MONGODB_URI`) ให้ชี้ไปที่คลัสเตอร์/เซิร์ฟเวอร์ที่พร้อมใช้ ก่อนรัน
แต่ละไฟล์เทสต์ใช้ฐานข้อมูลแยกของตัวเอง (`car-rental-test-*`) จึงรันขนานกันได้โดยไม่ชนกัน และไม่แตะฐานข้อมูลจริง

### Pagination ของ API หลังบ้าน

`GET /api/admin/bookings` และ `GET /api/admin/users` จะคืนทุกรายการตามเดิมถ้าไม่ส่ง `page`/`limit`
เมื่อส่งมา จะได้ `{ …, total, page, limit, pages }` (สูงสุด 100 แถวต่อหน้า)
`/api/admin/bookings` มี `counts` แยกตามสถานะติดมาด้วยเสมอ เพื่อให้หน้าเว็บแสดงจำนวนได้โดยไม่ต้องโหลดทุกแถว
