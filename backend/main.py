import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv

# Optional: Using LangChain for Gemini (we can mock the tools initially)
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate

load_dotenv()

app = FastAPI(title="TripAgent API")

# Initialize Gemini Model if API key is present
# Ensure GOOGLE_API_KEY is in your environment variables
if os.getenv("GOOGLE_API_KEY"):
    llm = ChatGoogleGenerativeAI(model="gemini-1.5-pro-latest", convert_system_message_to_human=True)
else:
    llm = None

class TripRequest(BaseModel):
    query: str

class Activity(BaseModel):
    id: str
    type: str
    time_start: str
    time_end: str
    duration_mins: int
    name: str
    description: str
    rating: float
    image_url: str
    coordinates: Dict[str, float]

class TravelStep(BaseModel):
    type: str = "travel"
    mode: str
    duration_mins: int
    instructions: str

class DetailedDayPlan(BaseModel):
    day_index: int
    date: str
    theme: str
    activities: List[Any] # Will contain both Activity and TravelStep

@app.get("/")
def read_root():
    return {"status": "ok", "message": "TripAgent API is running."}

@app.post("/plan")
async def create_plan(request: TripRequest):
    """
    Given a user query, generates a detailed trip plan using Gemini.
    Currently, this directly queries Gemini with a structured prompt.
    """
    if not os.getenv("GOOGLE_API_KEY"):
        # Return a mock response for testing the UI
        mock_plan = {
            "day_index": 1,
            "date": "2024-10-16",
            "theme": "Mock Art & Culture Day",
            "activities": [
                {
                    "id": "loc_001",
                    "type": "activity",
                    "time_start": "10:00",
                    "time_end": "12:30",
                    "duration_mins": 150,
                    "name": "Sagrada Família (Mock)",
                    "description": "Gaudi's masterpiece. Tips: Buy tickets early.",
                    "rating": 4.8,
                    "image_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Sagrada_Familia_01.jpg/800px-Sagrada_Familia_01.jpg",
                    "coordinates": {"lat": 41.4036, "lng": 2.1744}
                },
                {
                    "type": "travel",
                    "mode": "transit",
                    "duration_mins": 30,
                    "instructions": "Transit 19, Walk 8 mins"
                },
                {
                    "id": "loc_002",
                    "type": "activity",
                    "time_start": "13:00",
                    "time_end": "15:00",
                    "duration_mins": 120,
                    "name": "Park Güell (Mock)",
                    "description": "Colorful park with views",
                    "rating": 4.7,
                    "image_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Park_G%C3%BCell_01.jpg/800px-Park_G%C3%BCell_01.jpg",
                    "coordinates": {"lat": 41.4145, "lng": 2.1527}
                }
            ]
        }
        return {"plan": mock_plan, "is_mock": True}

    prompt_template = """
    You are an expert AI Travel Planner.
    User request: {query}
    
    Please create a detailed day-by-day itinerary.
    Output the plan strictly as a JSON object matching this schema:
    {{
      "day_index": 1,
      "date": "2024-10-16",
      "theme": "Art & Culture",
      "activities": [
        {{
          "id": "loc_001",
          "type": "activity",
          "time_start": "10:00",
          "time_end": "12:30",
          "duration_mins": 150,
          "name": "Location Name",
          "description": "Brief description",
          "rating": 4.8,
          "image_url": "https://example.com/img.jpg",
          "coordinates": {{"lat": 41.4, "lng": 2.1}}
        }},
        {{
          "type": "travel",
          "mode": "transit",
          "duration_mins": 30,
          "instructions": "Transit 19, Walk 8 mins"
        }}
      ]
    }}
    
    Provide ONLY the valid JSON block.
    """
    
    prompt = PromptTemplate(input_variables=["query"], template=prompt_template)
    
    # Use LCEL pipe syntax instead of LLMChain
    chain = prompt | llm
    
    try:
        response = chain.invoke({"query": request.query})
        # The response from ChatGoogleGenerativeAI is an AIMessage object
        response_text = response.content
        
        # Strip markdown json block backticks if present
        if response_text.startswith("```json"):
            response_text = response_text[7:-3]
        elif response_text.startswith("```"):
            response_text = response_text[3:-3]
            
        import json
        plan_data = json.loads(response_text.strip())
        return {"plan": plan_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
