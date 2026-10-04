# AI Digital Doctor — Setup & Run Guide

## 📁 Project Structure
```
Supabase Project/
├── index.html              ← Home Page
├── abstract.html           ← Project Abstract
├── medicine.html           ← AI Medicine Recommendation
├── appointment.html        ← Doctor Appointment Booking
├── hospital.html           ← Nearest Hospital Finder
├── blood-donation.html     ← Blood Donation System
├── login.html              ← User Login
├── register.html           ← User Registration
├── css/
│   └── style.css           ← Global Styles
├── js/
│   ├── main.js             ← Global Utilities
│   ├── auth.js             ← Authentication
│   ├── medicine.js         ← AI Symptom Engine
│   ├── appointment.js      ← Appointment Booking
│   ├── hospital.js         ← Hospital Finder
│   └── blood.js            ← Blood Donation
└── backend/
    ├── server.js           ← Express Server
    ├── package.json
    ├── .env.example        ← Copy to .env
    ├── models/
    │   ├── User.js
    │   ├── Doctor.js
    │   └── Hospital.js     (Blood + Hospital + Medicine models)
    ├── routes/
    │   ├── auth.js
    │   ├── symptoms.js
    │   ├── appointments.js
    │   ├── hospitals.js
    │   └── blood.js
    └── middleware/
        └── authMiddleware.js
```

---

## 🚀 Quick Start (Frontend Only — No Backend Needed)

Simply open `index.html` in your browser! The frontend works completely offline with built-in mock data.

**Works immediately:**
- AI Symptom Analysis (10 disease patterns built-in)
- Voice Input (Chrome/Edge)
- Doctor Listing & Appointment Booking
- Hospital Finder with GPS
- Blood Donation System
- Login/Register (demo mode)

---

## 🔧 Backend Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
```bash
# Copy the example file
copy .env.example .env

# Edit .env and set:
# MONGODB_URI=mongodb+srv://...  (from MongoDB Atlas)
# JWT_SECRET=your_strong_secret
```

### 3. MongoDB Atlas Setup
1. Go to https://cloud.mongodb.com
2. Create free cluster → Get connection string
3. Paste into MONGODB_URI in .env

### 4. Run the Backend
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server starts at: http://localhost:5000

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login user |
| GET | /api/auth/me | Get current user |
| POST | /api/symptom-analysis | AI symptom analysis |
| GET | /api/doctors | Get all doctors |
| POST | /api/book-appointment | Book appointment |
| GET | /api/get-hospitals | Get hospitals |
| GET | /api/blood-donors | Get blood donors |
| POST | /api/blood-donor | Register as donor |
| POST | /api/blood-request | Request blood |

---

## 🔐 Demo Login Credentials

For testing without backend:
- Email: `demo@test.com`
- Password: `password123`

---

## 🎤 Voice Input

Voice input uses the **Web Speech API** — works in:
- ✅ Google Chrome
- ✅ Microsoft Edge
- ❌ Firefox (not supported)
- ❌ Safari (partial support)

---

## 🗄️ Database Collections

| Collection | Description |
|------------|-------------|
| users | Registered users with hashed passwords |
| doctors | Doctor profiles and availability |
| appointments | Booked appointments |
| hospitals | Hospital data with geolocation |
| blooddonors | Registered blood donors |
| bloodrequests | Blood request records |
| medicinerecommendations | AI analysis history |

---

## 🚀 Deployment

### Frontend → Vercel
1. Push to GitHub
2. Import project at vercel.com
3. Deploy (no build needed — static HTML)

### Backend → Railway
1. Push backend folder to GitHub
2. Import at railway.app
3. Add environment variables
4. Deploy

### Database → MongoDB Atlas
- Free tier: 512MB storage
- docs.atlas.mongodb.com

---

## ⚠️ Medical Disclaimer

This platform provides AI-assisted health suggestions for informational purposes only.
Always consult a licensed medical professional for proper diagnosis and treatment.
