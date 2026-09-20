# 🦷 SecDentAI - Backend API

RESTful API backend for **SecDentAI** — Smart Dental Clinic Management & AI Assistant System built with Node.js, Express, and MySQL.

---

## 🌟 Key Features

* 🔐 **Authentication & Security:** Secure doctor authentication and session management using **JWT** and **bcrypt**.
* 👨‍⚕️ **Profile & Settings Management:** Doctor profile customization, image upload, clinic configuration, and localization settings.
* 📅 **Appointments & Patient Care:** Appointment scheduling, patient record tracking, and emergency case management.
* 🤖 **Automation & Telegram Integration:** Automated booking workflows and patient inquiry handling via Telegram Bot and **n8n**.
* 🔍 **AI Dental Vision:** API integration with custom **YOLOv8** models for dental caries detection and X-ray analysis.

---

## 🛠️ Tech Stack

* **Backend Runtime:** Node.js (Express.js)
* **Database:** MySQL (via `mysql2/promise`)
* **Authentication:** JSON Web Tokens (JWT)
* **File Processing:** Multer
* **AI & Automation:** Python (YOLOv8), n8n Workflows, Telegram Bot API

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Setup
Create a MySQL database named `secdentai_db` and import the structure from `schema.sql`:
```bash
mysql -u root -p secdentai_db < schema.sql
```

### 3. Environment Configuration
Create a `.env` file in the root directory based on `.env.example`:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=secdentai_db
JWT_SECRET=your_jwt_secret_key
```

### 4. Run the Server
```bash
npm start
```

---

## 📡 Key API Endpoints

| Category | Endpoint | Method | Description |
| :--- | :--- | :---: | :--- |
| **Auth** | `/api/auth/login` | `POST` | Authenticate doctor and issue JWT |
| **Profile** | `/api/profile` | `GET` / `PUT` | Fetch or update doctor profile & photo |
| **Settings** | `/api/settings` | `GET` / `PUT` | Manage clinic language & app preferences |
| **Appointments** | `/api/appointments` | `GET` / `POST` | Manage patient schedules |
| **Telegram** | `/api/telegram/webhook` | `POST` | Handle Telegram bot webhooks |

---

## 👤 Developer
**Munzer Ghazi** — Computer Engineer & Full-Stack Developer