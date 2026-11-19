# SlotKart — Smart Delivery Time-Slot E-Commerce Platform

**SlotKart** is a complete, production-ready **MERN + Python (FastAPI)** E-Commerce platform built around a practical real-world logistics USP: **Smart 2-Hour Delivery Time Slots**.

Instead of showing a vague delivery *date* (which leads to missed deliveries and expensive returns), SlotKart lets customers pick a guaranteed **2-hour IST delivery window** over the next 7 days, powered by a dedicated **Python FastAPI microservice** managing live pincode capacity, smart slot recommendations, atomic booking, 3-hour reschedule cutoffs, 4-digit OTP handover, and *"Reschedule instead of Return"*.

---

## Architecture Overview

```text
┌──────────────────────────────┐
│   React 18 + Vite (/client)  │  Plain CSS + CSS Variables, Chart.js, Axios, Context API
│   http://localhost:5173      │  (Served statically by Express in production)
└──────────────┬───────────────┘
               │ HTTPS / HTTP + httpOnly JWT Cookie (/api/*)
               ▼
┌──────────────────────────────┐         X-Internal-Key Header         ┌──────────────────────────────────┐
│  Node 20 + Express (/server) │ ────────────────────────────────────► │ Python 3.11 + FastAPI            │
│  http://localhost:5000       │ ◄──────────────────────────────────── │ (/slot-service) :8000            │
│  Auth, Catalog, Cart, Orders │   Resilient HTTP Proxy (10s timeout)  │ Smart Delivery Slot Engine (IST) │
└──────────────┬───────────────┘                                       └────────────────┬─────────────────┘
               │                                                                        │
               └───────────────────────────►  MongoDB Atlas  ◄──────────────────────────┘
                                            Database: slotkart
                       (users, products, orders, ... + slot_capacity owned by Python)
```

### Monorepo Structure

```text
slotkart/
├── client/          # React 18 + Vite SPA (Plain CSS, zero Tailwind/Bootstrap/CDN)
├── server/          # Node 20 + Express 4 + Mongoose REST API & Production Static Host
├── slot-service/    # Python 3.11 + FastAPI + PyMongo + Pydantic Smart Slot Engine
└── README.md
```

---

## Key Features

### Smart Delivery Slot Engine (Python FastAPI)
- **Next 7 Days × Five 2-Hour IST Windows:** `10:00 AM - 12:00 PM`, `12:00 PM - 2:00 PM`, `2:00 PM - 4:00 PM`, `4:00 PM - 6:00 PM`, `6:00 PM - 8:00 PM` (`Asia/Kolkata`).
- **Live Capacity Status:** Per-pincode capacity (default 5 orders/slot) with `Available`, `Filling fast` (`>= 70%` booked), and `Full` (disabled).
- **Recommended Slot:** Automatically highlights the least-loaded upcoming slot with a human-readable reason.
- **Atomic Booking & Safe Release:** Conditional MongoDB `update_one` (`$expr: {$lt: ["$booked", "$capacity"]}` + `$inc`) prevents race-condition overbooking.
- **Reschedule Rules:** Max **2 reschedules** per order, strictly enforced at **>= 3 hours** before slot start (with a partner-triggered *"Reschedule instead of Return"* bypass if a customer is unavailable).
- **Service Security & Resilience:** Protected via `X-Internal-Key`; Express degrades gracefully (`"Slot service busy, please retry"`) if the Python service is unreachable.

### Full E-Commerce & Role-Based Dashboards (MERN)
- **Authentication & Security:** JWT stored in `httpOnly`, `SameSite=Lax` cookie; bcrypt password hashing; 5 failed logins lock account for 5 minutes; Helmet, strict CORS, rate limiting, NoSQL sanitization, and input validation.
- **Customer ("My Board"):** Next upcoming delivery hero card with live countdown and 4-digit OTP, order status timeline (`Placed -> Packed -> Shipped -> Out for Delivery -> Delivered`), reschedule modal, cancel before `Shipped`, saved addresses CRUD, wishlist, notifications inbox, profile & password management.
- **Admin Dashboard:** KPI cards (orders, revenue, today's deliveries), live **Chart.js** Slot Utilization bar + doughnut charts powered by Python `/analytics/utilization`, Product & Category CRUD, Order status & Delivery Partner assignment, and live Slot Capacity management.
- **Delivery Partner Dashboard:** Assigned deliveries sorted chronologically by date & 2-hour slot window, masked customer phone numbers, `"Out for Delivery"` & `"1-Hour Reminder"` notifications, 4-digit OTP verification on handover, and `"Customer Unavailable"` -> triggers *"Reschedule instead of Return"*.

---

## Demo Credentials (Auto-Seeded)

| Role | Email | Password | Dashboard Route |
| :--- | :--- | :--- | :--- |
| **Customer** | `customer@demo.com` | `Customer@123` | `/dashboard` |
| **Admin** | `admin@demo.com` | `Admin@123` | `/admin` |
| **Delivery Partner** | `delivery@demo.com` | `Delivery@123` | `/delivery` |

- **Pre-seeded Pincodes:** `302001`, `302017`, `324001` (auto-created for the next 7 days on Python service startup).
- **Pre-seeded Catalog:** 6 Categories, 36 Products, 1 Default Address, and 2 Sample Orders (idempotent seed on Express startup).

---

## Local Setup (3 Terminals)

### Prerequisites
- **Node.js 20+** and **npm**
- **Python 3.11+** and **pip**
- **MongoDB Atlas** free cluster URI (or local MongoDB running on `mongodb://localhost:27017`)

### 1. Configure Environment Files

Copy each `.env.example` to `.env` and fill in your `MONGO_URI` and a matching `INTERNAL_API_KEY`:

```bash
cp slot-service/.env.example slot-service/.env
cp server/.env.example server/.env
cp client/.env.example client/.env
```

> **Important:** Make sure `INTERNAL_API_KEY` is identical in `slot-service/.env` and `server/.env`, and both point to the same MongoDB database (`slotkart`).

### 2. Terminal 1 — Start Python FastAPI Slot Engine (`:8000`)

**macOS / Linux:**
```bash
cd slot-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Windows (PowerShell):**
```powershell
cd slot-service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Verify health: `http://localhost:8000/health`

### 3. Terminal 2 — Seed & Start Express Backend (`:5000`)

```bash
cd server
npm install
npm run seed
npm run dev
```

Verify health (checks both MongoDB and Python slot-service): `http://localhost:5000/health`

### 4. Terminal 3 — Start React Vite Client (`:5173`)

```bash
cd client
npm install
npm run dev
```

Open **`http://localhost:5173`** in your browser.

---

## Production Deployment (Railway — 2 Services)

In production, Express serves the built React app (`client/dist`), so only **2 Railway services** + **1 MongoDB Atlas Free Cluster** are needed:

1. **Service A — Python Slot Engine (`slot-service`)**
   - **Root Directory:** `slot-service`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Env Vars:** `MONGO_URI`, `MONGO_DB_NAME=slotkart`, `INTERNAL_API_KEY`, `DEFAULT_SLOT_CAPACITY=5`, `SEED_PINCODES=302001,302017,324001`, `TZ=Asia/Kolkata`
2. **Service B — Node/Express + Built React Client (`server`)**
   - **Root Directory:** `/` *(repository root so the build can compile `client/` and copy into `server/public`)*
   - **Build Command:** `npm --prefix client install && npm --prefix client run build && mkdir -p server/public && cp -r client/dist/* server/public && npm --prefix server install`
   - **Start Command:** `node server/server.js`
   - **Env Vars:** `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN=7d`, `CLIENT_URL=<your-railway-node-url>`, `SLOT_SERVICE_URL=<your-railway-python-url>`, `INTERNAL_API_KEY` *(must match Service A)*

---

## Health & Verification Endpoints

- `GET /health` on `slot-service` (`:8000`) — returns MongoDB status & IST server time.
- `GET /health` on `server` (`:5000`) — returns MongoDB status & live connectivity check to `slot-service`.

---

## License

Built for academic demonstration and portfolio showcase.
