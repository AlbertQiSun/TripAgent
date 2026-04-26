# TripAI — AI-Powered Travel Planner with Community Intelligence

<p align="center">
  <strong>Plan smarter trips with AI reasoning, real-time search, and community-shared itineraries.</strong>
</p>

TripAI is a full-stack travel planning application powered by **Google Gemini 2.5 Flash** with ReAct reasoning, Google Search grounding, and a community-driven knowledge base. It generates detailed, practical day-by-day itineraries with real coordinates, transit directions, pricing, and ethical considerations — then improves over time as users share and review trips.

---

## ✨ Features

### 🧠 AI Planning Engine
- **ReAct Reasoning** — The AI thinks step-by-step, searches the web for real-time info, then generates a plan
- **Google Search Grounding** — Live data for prices, hours, closures, and seasonal info
- **Multimodal Input** — Upload photos (hotel confirmations, restaurant menus, screenshots) and the AI analyzes them
- **Smart Modifications** — Say "I live in Huamu Pudong" and the plan adjusts transit from your home, keeping existing activities
- **Long-Term Memory** — The AI remembers your preferences (diet, budget, interests) across sessions

### 🌍 Community System
- **Publish & Share** — Share your trip anonymously with the community (consent required)
- **Browse & Discover** — Search community trips by destination, see ratings and reviews
- **Star Ratings & Reviews** — Rate trips 1-5 stars with optional comments
- **RAG Retrieval** — When you plan a trip, the AI automatically finds similar community trips and uses them as reference for better recommendations
- **Profile Matching** — Embeddings match your traveler profile (budget student, luxury, family, vegan) to the most relevant community trips

### 🗺️ Interactive Map
- **Live Map Pins** — All activities displayed on a Leaflet map with route lines
- **Click-to-Scroll** — Click a map pin to jump to that activity in the itinerary
- **Swap & Remove** — Modify individual activities directly from the itinerary

### 📱 User Experience
- **Persistent Auth** — Login survives page refresh via localStorage
- **Auto-Save** — Conversations are saved automatically in the background
- **Session History** — Browse and reload past trip planning sessions
- **Rich Markdown Chat** — AI responses rendered with proper formatting
- **Trip Notes** — Pin reminders, hotel info, and flight details to your trip
- **Link Scraping** — Paste a URL and the AI incorporates that venue into your plan

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│  React · Leaflet Map · ReactMarkdown · CSS Modules       │
│  Port 3000 → Proxies /api/* to backend                   │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP/SSE
┌───────────────────────▼─────────────────────────────────┐
│                   Backend (FastAPI)                       │
│  Gemini 2.5 Flash · Google Search · ReAct · Embeddings   │
│  JWT Auth · SSE Streaming · Background Memory Extraction  │
│  Port 8000                                                │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                   SQLite Database                         │
│  users · sessions · community_trips · community_reviews   │
└─────────────────────────────────────────────────────────┘
```

### RAG Pipeline

```
User Query + Profile → Generate Embedding (text-embedding-004)
                            │
                            ▼
              Search community_trips by cosine similarity
                            │
                            ▼
              Top-3 matches (similarity > 0.65)
                            │
                            ▼
              Inject as system prompt context
                            │
                            ▼
              Gemini generates plan with community intelligence
```

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **Google API Key** — Get one from [Google AI Studio](https://aistudio.google.com/apikey)

### One-Command Setup

```bash
git clone https://github.com/AlbertQiSun/TripAgent.git
cd TripAgent
chmod +x setup.sh
./setup.sh
```

### Manual Setup

**1. Backend**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:
```env
GOOGLE_API_KEY=your_google_api_key_here
```

Start the server:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

**2. Frontend**

```bash
cd frontend
npm install
npm run dev
```

**3. Open** [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

```
TripAgent/
├── setup.sh                    # One-command setup
├── backend/
│   ├── main.py                 # FastAPI server, Gemini integration, all API endpoints
│   ├── database.py             # SQLite schema, CRUD, embedding search
│   ├── requirements.txt        # Python dependencies
│   ├── test_community.py       # Automated community tests (Shanghai/Tokyo)
│   └── test_nyc.py             # Automated NYC community tests
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx            # Main app component (chat, itinerary, community, auth)
│   │   ├── page.module.css     # All styles (light mode, community, modals)
│   │   ├── globals.css         # CSS variables and design tokens
│   │   └── layout.tsx          # Root layout
│   ├── src/components/
│   │   └── MapComponent.tsx    # Leaflet map with markers and route lines
│   ├── next.config.ts          # Next.js config with API proxy
│   └── package.json            # Node dependencies
```

---

## 🔌 API Endpoints

### Planning
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/plan/stream` | — | Stream a trip plan via SSE (supports images) |

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Login, returns JWT |

### Profile & Sessions
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/profile/{username}` | ✅ | Get user preferences |
| `POST` | `/profile` | ✅ | Save preferences |
| `GET` | `/sessions/{username}` | — | List saved sessions |
| `GET` | `/sessions/detail/{id}` | — | Get session detail |
| `POST` | `/sessions/autosave` | ✅ | Auto-save session |

### Community
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/community/publish` | ✅ | Publish trip (requires consent) |
| `DELETE` | `/community/{id}` | ✅ | Unpublish own trip |
| `GET` | `/community/feed` | — | Browse trips (?destination= filter) |
| `GET` | `/community/{id}` | — | Trip detail + reviews |
| `POST` | `/community/{id}/review` | ✅ | Submit rating (1-5) + comment |

### Utilities
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/scrape` | Scrape URL content for trip context |

---

## 🧪 Testing

Seed the community with test data:

```bash
cd backend
source .venv/bin/activate

# Populate with Shanghai/Tokyo trips (5 users, 5 trips, 8 reviews)
python test_community.py

# Populate with NYC trips (3 users, 3 trips, 6+ reviews)
python test_nyc.py
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | ✅ | Gemini API key from [AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | — | Model override (default: `gemini-2.5-flash`) |

---

## 📄 License

MIT
