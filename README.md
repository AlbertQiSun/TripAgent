# TripAI — AI-Powered Travel Planner with Community Intelligence

<p align="center">
  <strong>Plan smarter trips with AI reasoning, real-time search, persistent memory, and community-shared itineraries.</strong>
</p>

TripAI is a full-stack travel planning application powered by **Google Gemini 2.5 Flash** with ReAct reasoning, Google Search grounding, and a community-driven knowledge base. It generates detailed, practical day-by-day itineraries with real coordinates, transit directions, pricing, and ethical considerations — then improves over time as users share and review trips.

**Why not just use Gemini / Claude / ChatGPT?** → See [Key Differentiators](#-key-differentiators) below.

---

## ✨ Features

### 🧠 AI Planning Engine
- **ReAct Reasoning** — The AI thinks step-by-step, searches the web for real-time info, then generates a plan. Each step is shown transparently in collapsible cards.
- **Google Search Grounding** — Live data for prices, hours, closures, and seasonal info with cited sources.
- **Triple Plan Generation (A/B/C)** — Every new request generates three variants: Balanced, Adventurous, and Relaxed. All shown side-by-side with a "Choose" button.
- **Smart Modifications** — Say "Swap out the Eiffel Tower" or "Remove lunch" and the plan updates inline. Say "I live in Huamu Pudong" and transit adjusts from your home.
- **Dual Model Support** — Switch between Gemini (cloud, default) and Qwen3-8B (local via vLLM) for offline planning.

### 👤 User Intelligence
- **Structured Onboarding** — New users set up their profile via multi-choice pill selectors: budget, age, identity, interests, wake-up style, pace, dietary.
- **Persistent AI Memory** — The AI automatically extracts long-term preferences from every conversation (diet, hobbies, mobility). Manual selections are protected and never overwritten.
- **Dual-Section Profile** — `[USER SELECTIONS]` (set by UI, immutable) + `[AI LEARNED]` (auto-updated from conversations).

### 🌍 Community System
- **Publish & Share** — Share your trip anonymously with the community (consent required). Self-rate at publish.
- **Browse & Discover** — Search community trips by destination, see ratings, reviews, and auto-generated tags.
- **Star Ratings & Reviews** — Rate trips 1-5 stars with optional comments. Rankings by average rating.
- **RAG Retrieval** — When you plan a trip, the AI finds similar community trips (cosine similarity > 0.65) and uses them as reference.
- **Profile Matching** — Embeddings match your traveler profile to the most relevant community trips.

### 🗺️ Interactive Map
- **Live Map Pins** — All activities displayed on a Leaflet map with OSRM route lines.
- **Click-to-Scroll** — Click a map pin to jump to that activity in the itinerary (and vice versa).
- **Plan Variant Sync** — Switching between Plan A/B/C updates the map markers and route instantly.
- **Fly-to Animation** — Selecting an activity smoothly pans and zooms the map.

### 💬 Conversation Control
- **Edit Any Message** — Click ✏️ on a user message to re-edit and re-send, branching the conversation.
- **Regenerate** — Click 🔄 on any AI response to get a different result.
- **Plan Version History** — Navigate between plan versions with Prev/Next buttons.
- **Stop Generation** — Cancel streaming mid-generation.

### 📱 User Experience
- **Multimodal Input** — Upload photos (the AI analyzes them) or paste URLs (auto-scraped and injected as context).
- **Persistent Auth** — JWT-based login survives page refresh via localStorage.
- **Auto-Save** — Conversations are saved automatically after every AI response.
- **Session History** — Browse and reload past trip planning sessions.
- **Trip Notes** — Pin reminders, hotel info, and flight details.
- **Inline Editing** — Swap or remove individual activities directly from itinerary cards.
- **Rich Itinerary Cards** — Time, name, rating, description, price, hours, closed days, booking info, website, ethical notes.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 16)                   │
│  React · Leaflet Map · ReactMarkdown · CSS Modules        │
│  SSE Client · Plan Comparison Grid · Onboarding Flow      │
│  Port 3000 → Proxies /api/* to backend                    │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP/SSE
┌───────────────────────▼─────────────────────────────────┐
│                   Backend (FastAPI)                        │
│  Gemini 2.5 Flash (primary) · Qwen3-8B via vLLM (local)  │
│  Google Search Grounding · ReAct Agent · Embeddings       │
│  JWT Auth · SSE Streaming · Background Memory Extraction  │
│  RAG Pipeline · Auto-Tagging · URL Scraping               │
│  Port 8000                                                │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                   SQLite Database                          │
│  users · sessions · community_trips · community_reviews   │
│  embeddings (text-embedding-004) · cosine similarity      │
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

**4. (Optional) Local Model** — Run a vLLM server on port 8001:
```bash
vllm serve Qwen/Qwen3-8B --port 8001
```

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
│   │   ├── page.tsx            # Main app (chat, itinerary, community, auth, onboarding)
│   │   ├── page.module.css     # Styles (glassmorphism, pills, comparison grid, modals)
│   │   ├── globals.css         # CSS variables and design tokens
│   │   └── layout.tsx          # Root layout
│   ├── src/components/
│   │   └── MapComponent.tsx    # Leaflet map with markers, routing, and fly-to
│   ├── next.config.ts          # Next.js config with API proxy
│   └── package.json            # Node dependencies
```

---

## 🔌 API Endpoints

### Planning
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/plan/stream` | — | Stream a trip plan via SSE (supports images, model choice) |
| `POST` | `/plan` | — | Non-streaming batch endpoint |

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/auth/register` | Create account (triggers onboarding) |
| `POST` | `/auth/login` | Login, returns JWT |

### Profile & Sessions
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/profile/{username}` | ✅ | Get user preferences |
| `POST` | `/profile` | ✅ | Save preferences |
| `GET` | `/sessions/{username}` | ✅ | List saved sessions |
| `GET` | `/sessions/detail/{id}` | — | Get session detail |
| `POST` | `/sessions/autosave` | ✅ | Auto-save session |

### Community
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/community/publish` | ✅ | Publish trip (requires consent, auto-tags, embedding) |
| `DELETE` | `/community/{id}` | ✅ | Unpublish own trip |
| `GET` | `/community/feed` | — | Browse trips (?destination= filter) |
| `GET` | `/community/{id}` | — | Trip detail + reviews (anonymized) |
| `POST` | `/community/{id}/review` | ✅ | Submit rating (1-5) + comment |

### Utilities
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/scrape` | Scrape URL content for trip context |

---

## 🏆 Key Differentiators

**Why TripAI is better than using Gemini / Claude / ChatGPT directly:**

1. **Structured Output → Interactive UI** — Not a wall of text. A live map, clickable cards, swap/remove buttons.
2. **Persistent Memory** — The AI remembers your dietary restrictions, budget, and travel style forever.
3. **Community Intelligence (RAG)** — Plans are enriched by real travelers' experiences, ranked by ratings.
4. **Triple-Plan Comparison** — See Balanced vs Adventurous vs Relaxed side-by-side. Choose, then expand.
5. **Grounded in Real-Time Data** — Google Search grounding ensures prices and hours are current.
6. **Full Conversation Control** — Edit any message, regenerate responses, navigate plan versions.
7. **Multimodal Understanding** — Upload a photo of a place → AI identifies it and adds it to your trip.
8. **Offline Capability** — Switch to local Qwen3-8B model when connectivity is limited.
9. **Privacy-First Community** — Share trips anonymously. Usernames are never exposed.
10. **Ethical Awareness** — Flags cultural norms, legal restrictions, and ethical notes per activity.

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
