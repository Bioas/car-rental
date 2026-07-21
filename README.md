# 🚗 ระบบบริหารจัดการยานพาหนะ (Car Rental Management System)

ระบบจองรถยนต์สำหรับองค์กร — พนักงานสามารถดูรถว่าง จองรถ และติดตามสถานะได้ผ่านหน้าเว็บ ส่วนผู้ดูแลระบบสามารถจัดการรถยนต์ อนุมัติ/ปฏิเสธคำขอ ดูรายงาน และจัดการผู้ใช้ได้ทั้งหมด

> สร้างด้วย **React + Vite + Tailwind CSS** (Frontend) และ **Express + SQLite** (Backend) — ภาษาไทยทั้งระบบ 🇹🇭

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

| Role  | Email                    | Password  |
|-------|--------------------------|-----------|
| Admin | admin@carrental.local    | admin123  |
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
├── api/                    # API entry point
│   └── index.js
├── server/                 # Backend (Express + SQLite)
│   ├── index.js            # Server entry
│   ├── db.js               # Database setup (sql.js)
│   ├── seed.js             # Seed ข้อมูลทดสอบ
│   ├── middleware/
│   │   └── auth.js         # JWT authentication
│   └── routes/
│       ├── auth.js         # Login/Register/Me
│       ├── bookings.js     # Booking CRUD
│       ├── cars.js         # Car management
│       ├── admin.js        # Admin endpoints
│       ├── notifications.js # Notification system
│       └── public.js       # Public endpoints
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
│   │   └── ui/             # Reusable UI components
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
│   │   ├── constants.js    # Status labels, colors
│   │   └── api.js          # API helpers
│   └── styles/
│       └── globals.css     # Tailwind + custom styles
├── tailwind.config.js
├── vite.config.ts
└── package.json
```

---

## 🛠️ Tech Stack

| Layer    | Technology                                      |
|----------|-------------------------------------------------|
| Frontend | React 18, React Router 6, Tailwind CSS 3, Vite 6 |
| Calendar | FullCalendar 6                                  |
| Charts   | Chart.js + react-chartjs-2                      |
| Backend  | Express 5                                       |
| Database | SQLite (sql.js — in-process, zero config)       |
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
