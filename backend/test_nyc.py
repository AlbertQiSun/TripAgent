"""Populate community with diverse New York trips + cross-reviews."""
import requests, json

BASE = "http://localhost:8000"

# Reuse existing users + add NYC-specific ones
NYC_USERS = [
    {"username": "nyc_foodie", "password": "test123", "profile": "Food blogger, $60/day, loves hidden gem restaurants and food markets"},
    {"username": "nyc_student", "password": "test123", "profile": "NYU student, broke budget $20/day, free activities and cheap eats"},
    {"username": "nyc_couple", "password": "test123", "profile": "Young couple, romantic getaway, $150/day, Broadway shows and rooftops"},
]

NYC_TRIPS = [
    {"user_idx": 0, "destination": "New York", "title": "NYC Hidden Foodie Gems & Markets Tour",
     "plan": {"days": [
         {"day_index": 1, "date": "Day 1", "theme": "Downtown Food Crawl", "activities": [
             {"type": "activity", "time_start": "09:00", "name": "Russ & Daughters", "description": "Iconic lox and bagels since 1914. Get the classic with cream cheese.", "coordinates": {"lat": 40.7225, "lng": -73.9882}, "logistics": {"ticket_price": "$15", "opening_time": "08:00", "closing_time": "18:00"}, "rating": 4.8},
             {"type": "travel", "mode": "walk", "duration_mins": 10, "instructions": "Walk south on Orchard St"},
             {"type": "activity", "time_start": "11:00", "name": "Essex Market", "description": "Renovated food hall with 30+ vendors. Try the pupusas and fresh juice.", "coordinates": {"lat": 40.7185, "lng": -73.9877}, "logistics": {"ticket_price": "Free entry, $10-20 food", "opening_time": "08:00", "closing_time": "20:00"}, "rating": 4.5},
             {"type": "travel", "mode": "transit", "duration_mins": 20, "instructions": "F train to W 4th St"},
             {"type": "activity", "time_start": "13:00", "name": "Joe's Pizza", "description": "Best $3 slice in Greenwich Village. Cash only.", "coordinates": {"lat": 40.7306, "lng": -73.9969}, "logistics": {"ticket_price": "$3/slice"}, "rating": 4.6},
             {"type": "travel", "mode": "walk", "duration_mins": 15, "instructions": "Walk west to Hudson River"},
             {"type": "activity", "time_start": "15:00", "name": "Chelsea Market", "description": "Upscale food hall in a former factory. Great for browsing and snacking.", "coordinates": {"lat": 40.7424, "lng": -74.0061}, "logistics": {"ticket_price": "Free entry"}, "rating": 4.4},
             {"type": "activity", "time_start": "19:00", "name": "Xi'an Famous Foods", "description": "Hand-pulled noodles, spicy cumin lamb. Multiple locations.", "coordinates": {"lat": 40.7569, "lng": -73.9861}, "logistics": {"ticket_price": "$12-18"}, "rating": 4.7},
         ]},
         {"day_index": 2, "date": "Day 2", "theme": "Outer Borough Bites", "activities": [
             {"type": "activity", "time_start": "10:00", "name": "Smorgasburg Williamsburg", "description": "Weekend outdoor food market, 100+ vendors.", "coordinates": {"lat": 40.7217, "lng": -73.9619}, "logistics": {"ticket_price": "Free entry, $5-15/item", "opening_time": "11:00", "closing_time": "18:00", "closed_days": "Mon-Fri"}, "rating": 4.6},
             {"type": "travel", "mode": "transit", "duration_mins": 25, "instructions": "L train to Union Sq, transfer to 7 train"},
             {"type": "activity", "time_start": "14:00", "name": "Flushing Chinatown", "description": "Most authentic Chinese food in NYC. Try soup dumplings at Nan Xiang.", "coordinates": {"lat": 40.7596, "lng": -73.8317}, "logistics": {"ticket_price": "$8-15"}, "rating": 4.7},
         ]}
     ]}},
    {"user_idx": 1, "destination": "New York", "title": "Broke Student NYC — Free & Cheap Adventures",
     "plan": {"days": [
         {"day_index": 1, "date": "Day 1", "theme": "Free Manhattan Must-Sees", "activities": [
             {"type": "activity", "time_start": "09:00", "name": "Central Park", "description": "Free morning walk through Bethesda Fountain and The Mall. Gorgeous in any season.", "coordinates": {"lat": 40.7829, "lng": -73.9654}, "logistics": {"ticket_price": "Free"}, "rating": 4.8},
             {"type": "travel", "mode": "walk", "duration_mins": 20, "instructions": "Walk south through park"},
             {"type": "activity", "time_start": "11:00", "name": "The Met (Pay What You Wish)", "description": "World-class art for any donation. Suggested $25 but $1 works for NY students.", "coordinates": {"lat": 40.7794, "lng": -73.9632}, "logistics": {"ticket_price": "Pay what you wish (NY residents)"}, "rating": 4.9},
             {"type": "travel", "mode": "transit", "duration_mins": 15, "instructions": "6 train downtown"},
             {"type": "activity", "time_start": "14:00", "name": "High Line", "description": "Elevated park on old railway. Free, amazing views and art installations.", "coordinates": {"lat": 40.7480, "lng": -74.0048}, "logistics": {"ticket_price": "Free"}, "rating": 4.7},
             {"type": "activity", "time_start": "16:00", "name": "Washington Square Park", "description": "Street performers, chess players, and people-watching at NYU's backyard.", "coordinates": {"lat": 40.7308, "lng": -73.9973}, "logistics": {"ticket_price": "Free"}, "rating": 4.5},
             {"type": "activity", "time_start": "18:00", "name": "Staten Island Ferry", "description": "FREE ferry with Statue of Liberty views. Best free thing in NYC.", "coordinates": {"lat": 40.6433, "lng": -74.0724}, "logistics": {"ticket_price": "Free"}, "rating": 4.6},
         ]}
     ]}},
    {"user_idx": 2, "destination": "New York", "title": "Romantic NYC Weekend for Couples",
     "plan": {"days": [
         {"day_index": 1, "date": "Day 1", "theme": "Romance in Manhattan", "activities": [
             {"type": "activity", "time_start": "10:00", "name": "Central Park Horse Carriage Ride", "description": "Classic romantic experience through the park.", "coordinates": {"lat": 40.7648, "lng": -73.9737}, "logistics": {"ticket_price": "$65 for 20 min"}, "rating": 4.3},
             {"type": "activity", "time_start": "12:00", "name": "Brunch at Sarabeth's", "description": "Iconic NYC brunch spot. Try the lemon ricotta pancakes.", "coordinates": {"lat": 40.7738, "lng": -73.9721}, "logistics": {"ticket_price": "$30-45/person"}, "rating": 4.5},
             {"type": "travel", "mode": "taxi", "duration_mins": 15, "instructions": "Taxi to Times Square"},
             {"type": "activity", "time_start": "14:00", "name": "Broadway Matinee Show", "description": "Catch a matinee — try TKTS booth for 50% off same-day tickets.", "coordinates": {"lat": 40.7580, "lng": -73.9855}, "logistics": {"ticket_price": "$80-150 (TKTS discount)"}, "rating": 4.8},
             {"type": "activity", "time_start": "19:00", "name": "Top of the Rock Sunset", "description": "Sunset views from 70 floors up. Less crowded than Empire State.", "coordinates": {"lat": 40.7593, "lng": -73.9794}, "logistics": {"ticket_price": "$40/person"}, "rating": 4.7},
             {"type": "activity", "time_start": "21:00", "name": "Rooftop Bar at 230 Fifth", "description": "Iconic rooftop with Empire State Building views.", "coordinates": {"lat": 40.7440, "lng": -73.9880}, "logistics": {"ticket_price": "$20-30/cocktail"}, "rating": 4.4},
         ]}
     ]}},
]

def login(user):
    requests.post(f"{BASE}/auth/register", json={"username": user["username"], "password": user["password"]})
    r = requests.post(f"{BASE}/auth/login", json={"username": user["username"], "password": user["password"]})
    token = r.json().get("token", "")
    requests.post(f"{BASE}/profile", json={"username": user["username"], "preferences": user["profile"]},
                  headers={"Authorization": f"Bearer {token}"})
    return token

print("=" * 60)
print("NYC COMMUNITY TEST")
print("=" * 60)

print("\n1. Register NYC users")
tokens = {}
for u in NYC_USERS:
    tokens[u["username"]] = login(u)
    print(f"   ✓ {u['username']}")

print("\n2. Publish NYC trips")
trip_ids = []
for trip in NYC_TRIPS:
    user = NYC_USERS[trip["user_idx"]]
    r = requests.post(f"{BASE}/community/publish", json={
        "destination": trip["destination"], "title": trip["title"],
        "plan_json": json.dumps(trip["plan"]), "profile_summary": user["profile"], "consent": True
    }, headers={"Authorization": f"Bearer {tokens[user['username']]}"})
    tid = r.json().get("trip_id", "?")
    trip_ids.append(tid)
    print(f"   ✓ #{tid}: {trip['title']}")

print("\n3. Cross-review NYC trips")
cross_reviews = [
    (1, 0, 5, "This foodie guide changed my life! Found amazing spots I never knew existed."),
    (2, 0, 4, "Great food picks! We used this for our date night food crawl."),
    (0, 1, 5, "Perfect for broke days! The Met pay-what-you-wish tip is clutch."),
    (2, 1, 4, "Good free activities list. We did the Staten Island Ferry — amazing!"),
    (0, 2, 4, "Romantic picks are solid. 230 Fifth rooftop was stunning."),
    (1, 2, 3, "Too expensive for me but the TKTS tip for Broadway is great."),
]
for reviewer_idx, trip_idx, rating, comment in cross_reviews:
    user = NYC_USERS[reviewer_idx]
    requests.post(f"{BASE}/community/{trip_ids[trip_idx]}/review",
                  json={"rating": rating, "comment": comment},
                  headers={"Authorization": f"Bearer {tokens[user['username']]}"})
    print(f"   ✓ {user['username'][:12]:12s} → #{trip_ids[trip_idx]} {'★'*rating}{'☆'*(5-rating)}")

# Also have existing test users review NYC trips
for existing in ["traveler_alice", "traveler_bob", "traveler_diana"]:
    requests.post(f"{BASE}/auth/login", json={"username": existing, "password": "test123"})
    r = requests.post(f"{BASE}/auth/login", json={"username": existing, "password": "test123"})
    t = r.json().get("token", "")
    if t:
        requests.post(f"{BASE}/community/{trip_ids[1]}/review",
                      json={"rating": 5, "comment": f"As a budget traveler, this is gold!"},
                      headers={"Authorization": f"Bearer {t}"})

print("\n4. Verify NYC feed")
r = requests.get(f"{BASE}/community/feed?destination=New York")
nyc = r.json().get("trips", [])
print(f"   NYC trips: {len(nyc)}")
for t in nyc:
    print(f"   [{t['destination']:10s}] \"{t['title']}\" — ★{t['avg_rating']} ({t['review_count']} reviews)")

print("\n5. Full community stats")
r = requests.get(f"{BASE}/community/feed?limit=50")
all_trips = r.json().get("trips", [])
print(f"   Total community trips: {len(all_trips)}")
dests = {}
for t in all_trips:
    dests[t["destination"]] = dests.get(t["destination"], 0) + 1
for d, c in sorted(dests.items()):
    print(f"   {d}: {c} trips")

print("\n" + "=" * 60)
print("NYC TESTS COMPLETE ✓")
print(f"Community now has {len(all_trips)} trips across {len(dests)} destinations")
print("=" * 60)
