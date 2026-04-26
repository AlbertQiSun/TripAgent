import os
import json
import asyncio
import base64
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from sse_starlette.sse import EventSourceResponse

from google import genai
from google.genai import types
from openai import AsyncOpenAI

from database import (
    init_db, get_user_preferences, save_user_preferences, 
    save_session, update_session, get_sessions, get_session_detail, 
    register_user, verify_user,
    publish_trip, unpublish_trip, get_community_trips, get_community_trip_detail,
    add_review, search_trips_by_embedding
)

load_dotenv()

# Initialize Database
init_db()

app = FastAPI(title="TripAgent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Gemini Client Setup ──────────────────────────────────────────────────
GEMINI_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
MAPS_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

client = None
if GEMINI_KEY:
    client = genai.Client(api_key=GEMINI_KEY)

# ── Local vLLM Client Setup ──────────────────────────────────────────────
# Expects a vLLM server running OpenAI compatible API on port 8001
local_client = AsyncOpenAI(api_key="EMPTY", base_url="http://localhost:8001/v1")

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
FALLBACK_MODEL = "gemini-2.5-flash-lite"
LOCAL_MODEL_NAME = "Qwen/Qwen3-8B"

# ── Pydantic Models ───────────────────────────────────────────────────────
class Message(BaseModel):
    role: str
    content: str

class TripRequest(BaseModel):
    query: str
    history: Optional[list[Message]] = []
    username: Optional[str] = None
    current_plan: Optional[str] = None
    image_base64: Optional[str] = None  # Base64-encoded image for multimodal analysis
    image_mime: Optional[str] = None    # e.g. "image/jpeg", "image/png"
    model_choice: Optional[str] = "gemini" # "gemini" or "local"

class ProfileRequest(BaseModel):
    username: str
    preferences: str

class SessionRequest(BaseModel):
    username: str
    title: str
    history_json: str

class AuthRequest(BaseModel):
    username: str
    password: str

# ── JWT Setup ─────────────────────────────────────────────────────────────
import jwt
import datetime
from fastapi import HTTPException, Header, Depends

SECRET_KEY = "tripagent_super_secret"
ALGORITHM = "HS256"

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(days=7)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    username: str
    title: str
    history_json: str


# ── System Prompt ─────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are TripAI, an expert AI travel planner. 
You help users plan detailed, practical day-by-day itineraries and interact with them to refine their plans.

When given a travel query:
1. Review the conversation history to understand the user's preferences (food, interests, pace), BUDGET, and any past plans.
2. If the user's request is too vague OR if they haven't specified a BUDGET, briefly ask for clarification about their preferences and budget constraints.
3. If the user asks to modify a plan (e.g., "Swap out X", "Remove Y"), provide an updated JSON itinerary incorporating the change.
4. If the user provides additional context about themselves (e.g., "I live in Huamu", "My hotel is at X", "I'm vegan"), treat this as a PLAN UPDATE — modify the EXISTING plan to incorporate this info. For example:
   - Living location / hotel → Adjust the first and last activities of each day to start from and return to that location. Add travel segments from the user's home/hotel to the first activity and from the last activity back.
   - Dietary restrictions → Swap restaurant recommendations to match.
   - Budget changes → Replace expensive activities with budget-friendly alternatives.
   DO NOT start from scratch. Keep the same general structure and destinations, just adjust logistics, transit, and ordering.
5. Briefly explain your reasoning and what you plan to research. Take into account local laws and ethical restrictions (e.g. drinking age, licensing laws, cultural norms).
6. Finally, produce a detailed JSON itinerary.

Your final output MUST end with a JSON code block containing the itinerary in this exact schema. DO NOT include the JSON block if you are ONLY asking a clarifying question and cannot provide a plan yet.

```json
{
  "days": [
    {
      "day_index": 1,
      "date": "Day 1",
      "theme": "Theme for the day",
      "activities": [
        {
          "id": "loc_001",
          "type": "activity",
          "time_start": "09:00",
          "time_end": "11:00",
          "duration_mins": 120,
          "name": "Place Name",
          "description": "Brief description with practical tips",
          "rating": 4.5,
          "coordinates": {"lat": 35.6762, "lng": 139.6503},
          "logistics": {
            "ticket_price": "$25 / Free",
            "opening_time": "09:00",
            "closing_time": "18:00",
            "closed_days": "Mondays",
            "reservation_info": "Highly recommended, book via website",
            "official_website": "https://example.com"
          },
          "ethical_note": "Optional: e.g., Must be 21+ to enter, dress modestly."
        },
        {
          "type": "travel",
          "mode": "transit",
          "duration_mins": 15,
          "instructions": "Take the Yamanote Line from X to Y",
          "roadmap_instructions": "Walk 2 mins to X station, take train 10 mins, walk 3 mins."
        }
      ]
    }
  ]
}
```

IMPORTANT RULES:
- If the user provides specific preferences or a budget, ensure the plan strictly reflects them.
- Always include an ethical_note if local laws (drinking age, tour guide restrictions) or strong cultural norms apply to the activity.
- Include REAL coordinates for every activity (lat/lng).
- Include travel segments between activities with realistic durations and roadmap/transit instructions.
- If the user has a known home/hotel location, the first activity each day should start with a travel segment FROM their home, and the last segment should be a travel segment BACK to their home.
- Provide comprehensive logistics (ticket prices, hours, reservation info, website) in the logistics object for every activity.
- Each day should have 4-6 activities with travel in between.
- Use real, well-known places with accurate ratings.
- When modifying an existing plan, preserve the same activities unless a change is specifically needed. Only adjust transit, ordering, or swap items that conflict with the new info.
- **NEVER TRUNCATE**: You MUST generate ALL requested days in a single JSON response. If the user asks for 7 days, produce 7 days. If they ask for 14 days, produce 14 days. Never stop mid-way or say "I'll continue in the next message". For trips longer than 5 days, keep activity descriptions to 1-2 sentences to fit within output limits.
- For multi-week trips, be concise: short descriptions, minimal ethical_notes (only when truly needed), and brief logistics.
"""


# ── Background Tasks ────────────────────────────────────────────────────────

async def extract_and_update_memory(username: str, current_prefs: str, conversation: list[dict]):
    """Background task to extract user preferences from chat and save them."""
    if not client:
        return
    # Build conversation transcript for context
    transcript = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in conversation[-6:]])  # last 6 messages
    
    prompt = f"""You are a memory manager for a travel planning app. Your job is to maintain a concise user profile.

CURRENT PROFILE:
---
{current_prefs if current_prefs else '(empty - new user)'}
---

RECENT CONVERSATION:
---
{transcript}
---

INSTRUCTIONS:
1. Extract ALL permanent facts about the user from the conversation: age, school/university, affiliations, dietary restrictions, allergies, budget level, mobility needs, travel style, hobbies, family situation, etc.
2. If the user CORRECTS or UPDATES a previous fact (e.g. "NYU" → "NYU Shanghai", or mentions a specific budget like "$200/day"), UPDATE the profile accordingly. Do NOT keep the old incorrect version.
3. MERGE new facts with existing ones. Keep all old facts that are not contradicted.
4. Do NOT include temporary trip-specific details (like "wants to visit Paris this weekend").
5. Keep the profile under 200 words, concise bullet-point format.
6. If there are truly NO new or changed facts, output the current profile exactly as-is.

Output ONLY the updated profile text, nothing else."""
    try:
        resp = await client.aio.models.generate_content(
            model=MODEL,
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
        )
        if resp.text:
            new_prefs = resp.text.strip()
            if new_prefs != current_prefs:
                save_user_preferences(username, new_prefs)
                print(f"[Memory] Updated profile for {username}: {new_prefs[:120]}...")
            else:
                print(f"[Memory] No changes for {username}")
    except Exception as e:
        print(f"Memory extraction error: {e}")

# ── Embedding Helper ─────────────────────────────────────────────────────

EMBEDDING_MODEL = "text-embedding-004"

async def generate_embedding(text: str) -> list[float]:
    """Generate an embedding vector for the given text using Gemini."""
    if not client:
        return []
    try:
        result = await client.aio.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text
        )
        return result.embeddings[0].values
    except Exception as e:
        print(f"Embedding error: {e}")
        return []

# ── Core Agent Function ──────────────────────────────────────────────────
async def run_agent_stream(request: TripRequest):
    """
    Use Gemini with Google Search grounding to plan trips.
    Streams reasoning and search steps to the frontend via SSE.
    """
    if request.model_choice == "gemini" and not client:
        yield {"event": "thought", "data": json.dumps({
            "step_type": "thought",
            "content": "Error: No Gemini API key configured. Set GOOGLE_API_KEY in backend/.env"
        })}
        return

    # Configure with Google Search grounding + low thinking
    system_instruction = SYSTEM_PROMPT
    prefs = ""
    if request.username:
        prefs = get_user_preferences(request.username)
        if prefs:
            system_instruction += f"\n\nCRITICAL USER PROFILE PREFERENCES (MUST FOLLOW):\n{prefs}\n"
        # Spawn memory extractor in the background with full conversation
        conv_for_memory = [{"role": m.role, "content": m.content} for m in (request.history or [])]
        conv_for_memory.append({"role": "user", "content": request.query})
        asyncio.create_task(extract_and_update_memory(request.username, prefs, conv_for_memory))
            
    search_tool = types.Tool(google_search=types.GoogleSearch())
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        tools=[search_tool] if request.model_choice == "gemini" else None,
        thinking_config=types.ThinkingConfig(thinking_level="low") if request.model_choice == "gemini" else None,
    )

    # ── RAG: Search community trips for relevant context ────────────
    community_context = ""
    try:
        rag_query = f"{request.query} {prefs}"
        query_emb = await generate_embedding(rag_query)
        if query_emb:
            similar_trips = search_trips_by_embedding(query_emb, limit=3)
            relevant = [t for t in similar_trips if t.get("similarity", 0) > 0.65]
            if relevant:
                snippets = []
                for t in relevant:
                    plan_data = json.loads(t["plan_json"]) if isinstance(t["plan_json"], str) else t["plan_json"]
                    day_count = len(plan_data.get("days", []))
                    snippets.append(f"- \"{t['title']}\" ({t['destination']}, {day_count} days, ★{t['avg_rating']}) — Traveler: {t['profile_summary']}")
                community_context = "\n\nCOMMUNITY REFERENCE TRIPS (use these as inspiration, adapt to the current user's preferences):\n" + "\n".join(snippets)
                system_instruction += community_context
                print(f"[RAG] Injected {len(relevant)} community trips as context")
    except Exception as e:
        print(f"RAG search error: {e}")

    # Build conversation contents array
    contents = []
    if request.history:
        for msg in request.history:
            role = "user" if msg.role == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg.content)]))
    
    # If there's an existing plan, inject it as context so the model can modify it
    if request.current_plan:
        contents.append(types.Content(role="model", parts=[types.Part.from_text(
            text=f"Here is the current itinerary I generated:\n```json\n{request.current_plan}\n```"
        )]))
    
    # Build the user's current message parts
    user_parts = []
    # If an image is attached, add it as an inline image part
    if request.image_base64 and request.image_mime:
        try:
            image_bytes = base64.b64decode(request.image_base64)
            user_parts.append(types.Part.from_bytes(data=image_bytes, mime_type=request.image_mime))
        except Exception as e:
            print(f"Image decode error: {e}")
    user_parts.append(types.Part.from_text(text=request.query))
    contents.append(types.Content(role="user", parts=user_parts))

    # Emit initial thought
    yield {"event": "thought", "data": json.dumps({
        "step_type": "thought",
        "content": f"Analyzing request: \"{request.query}\". Using {'Local Model (' + LOCAL_MODEL_NAME + ')' if request.model_choice == 'local' else 'Gemini'}..."
    })}
    await asyncio.sleep(0.3)

    try:
        # Use streaming to get chunks as they arrive
        response_text = ""
        search_queries = []
        grounding_sources = []
        used_model = MODEL

        if request.model_choice == "local":
            # ── Local vLLM Path ──────────────────────────────────
            used_model = LOCAL_MODEL_NAME

            # Build OpenAI-compatible messages
            openai_messages = [{"role": "system", "content": system_instruction}]
            if request.history:
                for msg in request.history:
                    openai_messages.append({"role": "user" if msg.role == "user" else "assistant", "content": msg.content})
            if request.current_plan:
                openai_messages.append({"role": "assistant", "content": f"Here is the current itinerary I generated:\n```json\n{request.current_plan}\n```"})
            openai_messages.append({"role": "user", "content": request.query})

            local_response = await local_client.chat.completions.create(
                model=LOCAL_MODEL_NAME,
                messages=openai_messages,
                stream=True
            )

            async for chunk in local_response:
                if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                    text = chunk.choices[0].delta.content
                    response_text += text
                    yield {"event": "message", "data": json.dumps({"content": text})}

        else:
            # ── Gemini Path ──────────────────────────────────────
            try:
                response = await client.aio.models.generate_content(
                    model=MODEL,
                    contents=contents,
                    config=config,
                )
            except Exception as primary_err:
                yield {"event": "thought", "data": json.dumps({
                    "step_type": "thought",
                    "content": f"Primary model ({MODEL}) unavailable, switching to {FALLBACK_MODEL}..."
                })}
                await asyncio.sleep(0.2)
                used_model = FALLBACK_MODEL
                response = await client.aio.models.generate_content(
                    model=FALLBACK_MODEL,
                    contents=contents,
                    config=config,
                )

            # Extract grounding metadata (search queries and sources)
            if response.candidates and response.candidates[0].grounding_metadata:
                meta = response.candidates[0].grounding_metadata
                
                if meta.web_search_queries:
                    search_queries = list(meta.web_search_queries)
                    for sq in search_queries:
                        yield {"event": "action", "data": json.dumps({
                            "step_type": "action",
                            "content": f"Searching: \"{sq}\"",
                            "tool_name": "google_search",
                            "tool_input": sq,
                        })}
                        await asyncio.sleep(0.4)

                if meta.grounding_chunks:
                    for chunk in meta.grounding_chunks[:8]:
                        if chunk.web:
                            grounding_sources.append({
                                "title": chunk.web.title,
                                "uri": chunk.web.uri,
                            })
                    
                    source_summary = ", ".join([s["title"] for s in grounding_sources[:5]])
                    yield {"event": "observation", "data": json.dumps({
                        "step_type": "observation",
                        "content": f"Found {len(grounding_sources)} sources: {source_summary}",
                        "tool_name": "google_search",
                    })}
                    await asyncio.sleep(0.3)

            # Get the full response text
            response_text = response.text or ""

        # Split into reasoning text and JSON
        json_start = response_text.find("```json")
        reasoning_text = ""
        json_text = ""

        if json_start != -1:
            reasoning_text = response_text[:json_start].strip()
            json_block = response_text[json_start:]
            # Extract JSON from code block
            json_text = json_block.replace("```json", "").replace("```", "").strip()
        else:
            # Try to find raw JSON
            brace_start = response_text.find("{")
            if brace_start != -1:
                reasoning_text = response_text[:brace_start].strip()
                json_text = response_text[brace_start:].strip()
            else:
                reasoning_text = response_text

        # Emit the reasoning as a thought
        if json_text:
            if reasoning_text:
                yield {"event": "thought", "data": json.dumps({
                    "step_type": "thought",
                    "content": reasoning_text[:2000],
                })}
                await asyncio.sleep(0.3)
            yield {"event": "final", "data": json.dumps({
                "step_type": "final",
                "content": json_text,
                "sources": grounding_sources,
            })}
        else:
            yield {"event": "final", "data": json.dumps({
                "step_type": "final",
                "content": reasoning_text,
                "sources": grounding_sources,
            })}

    except Exception as e:
        yield {"event": "thought", "data": json.dumps({
            "step_type": "thought",
            "content": f"Error: {str(e)}",
        })}


# ── API Endpoints ─────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {
        "status": "ok",
        "message": "TripAgent API is running.",
        "model": MODEL,
        "has_gemini": bool(GEMINI_KEY),
        "has_maps": bool(MAPS_KEY),
    }


@app.post("/plan/stream")
async def stream_plan(request: TripRequest):
    """SSE endpoint streaming ReAct-style steps to the frontend."""
    return EventSourceResponse(run_agent_stream(request))


@app.post("/plan")
async def create_plan(request: TripRequest):
    """Non-streaming endpoint: collects all steps and returns at once."""
    steps = []
    final_plan = None

    async for event in run_agent_stream(request):
        data = json.loads(event["data"])
        steps.append(data)
        if data["step_type"] == "final":
            try:
                final_plan = json.loads(data["content"])
            except json.JSONDecodeError:
                final_plan = {"raw": data["content"]}

    return {"steps": steps, "plan": final_plan}

@app.post("/auth/register")
async def register(req: AuthRequest):
    success = register_user(req.username, req.password)
    if success:
        token = create_access_token({"sub": req.username})
        return {"status": "success", "message": "Account created", "token": token}
    return {"status": "error", "message": "Username already exists"}

@app.post("/auth/login")
async def login(req: AuthRequest):
    success = verify_user(req.username, req.password)
    if success:
        token = create_access_token({"sub": req.username})
        return {"status": "success", "message": "Logged in", "token": token}
    return {"status": "error", "message": "Invalid username or password"}

@app.post("/profile")
async def update_profile(req: ProfileRequest, username: str = Depends(get_current_user)):
    if req.username != username:
        raise HTTPException(status_code=403, detail="Not authorized")
    save_user_preferences(username, req.preferences)
    return {"status": "success"}

@app.get("/profile/{username}")
async def get_profile(username: str, current_user: str = Depends(get_current_user)):
    if username != current_user:
        raise HTTPException(status_code=403, detail="Not authorized")
    prefs = get_user_preferences(username)
    return {"preferences": prefs}

@app.post("/sessions")
async def create_session(req: SessionRequest, username: str = Depends(get_current_user)):
    if req.username != username:
        raise HTTPException(status_code=403, detail="Not authorized")
    session_id = save_session(username, req.title, req.history_json)
    return {"session_id": session_id}

@app.get("/sessions/{username}")
async def list_sessions(username: str, current_user: str = Depends(get_current_user)):
    if username != current_user:
        raise HTTPException(status_code=403, detail="Not authorized")
    return {"sessions": get_sessions(username)}

@app.get("/sessions/detail/{session_id}")
async def get_session(session_id: int):
    data = get_session_detail(session_id)
    if data is not None:
        return data
    return {"error": "Not found"}

class AutoSaveRequest(BaseModel):
    username: str
    title: str
    history_json: str
    session_id: Optional[int] = None

@app.post("/sessions/autosave")
async def autosave_session(req: AutoSaveRequest, current_user: str = Depends(get_current_user)):
    """Auto-save: create a new session or update an existing one."""
    if req.username != current_user:
        raise HTTPException(status_code=403, detail="Not authorized")
    if req.session_id:
        update_session(req.session_id, req.title, req.history_json)
        return {"session_id": req.session_id}
    else:
        session_id = save_session(req.username, req.title, req.history_json)
        return {"session_id": session_id}

class ScrapeRequest(BaseModel):
    url: str

@app.post("/scrape")
async def scrape_url(req: ScrapeRequest):
    """Scrape a URL and extract its main text content."""
    import httpx
    from html.parser import HTMLParser
    
    class TextExtractor(HTMLParser):
        def __init__(self):
            super().__init__()
            self.text_parts = []
            self.skip_tags = {'script', 'style', 'nav', 'footer', 'header', 'noscript'}
            self._skip_depth = 0
            self.title = ''
            self._in_title = False
        
        def handle_starttag(self, tag, attrs):
            if tag in self.skip_tags:
                self._skip_depth += 1
            if tag == 'title':
                self._in_title = True
        
        def handle_endtag(self, tag):
            if tag in self.skip_tags and self._skip_depth > 0:
                self._skip_depth -= 1
            if tag == 'title':
                self._in_title = False
        
        def handle_data(self, data):
            if self._in_title:
                self.title += data
            elif self._skip_depth == 0:
                text = data.strip()
                if text:
                    self.text_parts.append(text)
    
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            resp = await client.get(req.url, headers={'User-Agent': 'Mozilla/5.0 TripAI Bot'})
            if resp.status_code != 200:
                return {"error": f"Failed to fetch: HTTP {resp.status_code}", "title": "", "content": ""}
            
            extractor = TextExtractor()
            extractor.feed(resp.text)
            content = ' '.join(extractor.text_parts)[:2000]  # Limit to 2000 chars
            return {"title": extractor.title.strip(), "content": content, "url": req.url}
    except Exception as e:
        return {"error": str(e), "title": "", "content": ""}

# ── Community Endpoints ─────────────────────────────────────────────────

class PublishRequest(BaseModel):
    destination: str
    title: str
    plan_json: str
    profile_summary: str
    consent: bool  # Must be True to publish
    self_rating: int = 0

@app.post("/community/publish")
async def publish_community_trip(req: PublishRequest, current_user: str = Depends(get_current_user)):
    if not req.consent:
        raise HTTPException(status_code=400, detail="You must consent to share your trip anonymously.")
    # Generate embedding for retrieval
    embed_text = f"{req.destination} {req.title} {req.profile_summary}"
    embedding = await generate_embedding(embed_text)
    
    # Generate tags from profile summary
    tags = ""
    if client and req.profile_summary:
        try:
            tag_prompt = f"Extract 2 to 3 short tags (e.g., Budget, Family, Vegan) from this traveler profile summary. Return ONLY the tags separated by commas. Profile: {req.profile_summary}"
            resp = await client.aio.models.generate_content(
                model=MODEL,
                contents=tag_prompt,
            )
            tags = resp.text.strip()
        except Exception as e:
            print(f"Tag generation failed: {e}")
            pass
            
    trip_id = publish_trip(current_user, req.destination, req.title, req.plan_json, req.profile_summary, embedding, tags, req.self_rating)
    return {"status": "published", "trip_id": trip_id}

@app.delete("/community/{trip_id}")
async def unpublish_community_trip(trip_id: int, current_user: str = Depends(get_current_user)):
    success = unpublish_trip(trip_id, current_user)
    if not success:
        raise HTTPException(status_code=404, detail="Trip not found or you are not the owner.")
    return {"status": "unpublished"}

@app.get("/community/feed")
async def community_feed(destination: str = None, limit: int = 20):
    trips = get_community_trips(destination=destination, limit=limit)
    return {"trips": trips}

@app.get("/community/{trip_id}")
async def community_trip_detail(trip_id: int):
    trip = get_community_trip_detail(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    # Anonymize: remove username from the response
    trip.pop("username", None)
    for review in trip.get("reviews", []):
        review["username"] = review["username"][:2] + "***"  # Partial anonymize reviewer
    return trip

class ReviewRequest(BaseModel):
    rating: int  # 1-5
    comment: str = ""

@app.post("/community/{trip_id}/review")
async def submit_review(trip_id: int, req: ReviewRequest, current_user: str = Depends(get_current_user)):
    if req.rating < 1 or req.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5.")
    review_id = add_review(trip_id, current_user, req.rating, req.comment)
    if review_id == -1:
        raise HTTPException(status_code=400, detail="You already reviewed this trip.")
    return {"status": "reviewed", "review_id": review_id}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
