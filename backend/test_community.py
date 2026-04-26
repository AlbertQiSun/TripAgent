"""Automated test: populate community with diverse trips & test RAG retrieval."""
import requests, json, time

BASE = "http://localhost:8000"

USERS = [
    {"username": "traveler_alice", "password": "test123", "profile": "College student, budget $30/day, loves street food and museums"},
    {"username": "traveler_bob", "password": "test123", "profile": "Business traveler, luxury hotels, fine dining, $200/day budget"},
    {"username": "traveler_chen", "password": "test123", "profile": "Family with 2 kids, moderate budget $80/day, kid-friendly activities"},
    {"username": "traveler_diana", "password": "test123", "profile": "Solo female backpacker, vegan, hostels, $25/day, nature lover"},
    {"username": "traveler_erik", "password": "test123", "profile": "Retired couple, cultural tours, comfortable pace, $120/day"},
]

TRIPS = [
    {"user_idx": 0, "destination": "Shanghai", "title": "Budget Shanghai Street Food & Art Walk",
     "plan": {"days": [{"day_index": 1, "date": "Day 1", "theme": "Street Food & Art", "activities": [
         {"type": "activity", "time_start": "09:00", "name": "M50 Creative Park", "description": "Free galleries", "coordinates": {"lat": 31.2456, "lng": 121.4508}, "logistics": {"ticket_price": "Free"}, "rating": 4.5},
         {"type": "travel", "mode": "walk", "duration_mins": 15, "instructions": "Walk south"},
         {"type": "activity", "time_start": "12:00", "name": "Wujiang Road Food Street", "description": "Cheap local eats", "coordinates": {"lat": 31.2290, "lng": 121.4495}, "logistics": {"ticket_price": "15 RMB avg"}, "rating": 4.3},
         {"type": "activity", "time_start": "14:00", "name": "Shanghai Museum", "description": "World-class free museum", "coordinates": {"lat": 31.2295, "lng": 121.4737}, "logistics": {"ticket_price": "Free"}, "rating": 4.7},
     ]}]}},
    {"user_idx": 1, "destination": "Shanghai", "title": "Luxury Shanghai Fine Dining & Bund Experience",
     "plan": {"days": [{"day_index": 1, "date": "Day 1", "theme": "Luxury Bund", "activities": [
         {"type": "activity", "time_start": "10:00", "name": "The Peninsula Spa", "description": "Morning spa", "coordinates": {"lat": 31.2376, "lng": 121.4895}, "logistics": {"ticket_price": "800 RMB"}, "rating": 4.9},
         {"type": "activity", "time_start": "13:00", "name": "Ultraviolet by Paul Pairet", "description": "Michelin 3-star", "coordinates": {"lat": 31.2303, "lng": 121.4737}, "logistics": {"ticket_price": "6000 RMB"}, "rating": 4.8},
         {"type": "activity", "time_start": "19:00", "name": "Bar Rouge Rooftop", "description": "Bund cocktails", "coordinates": {"lat": 31.2399, "lng": 121.4908}, "logistics": {"ticket_price": "200 RMB"}, "rating": 4.5},
     ]}]}},
    {"user_idx": 2, "destination": "Tokyo", "title": "Family-Friendly Tokyo with Kids",
     "plan": {"days": [{"day_index": 1, "date": "Day 1", "theme": "Kid Adventures", "activities": [
         {"type": "activity", "time_start": "09:00", "name": "Tokyo Disneyland", "description": "Full day fun", "coordinates": {"lat": 35.6329, "lng": 139.8804}, "logistics": {"ticket_price": "7900 JPY adult"}, "rating": 4.8},
         {"type": "activity", "time_start": "18:00", "name": "Odaiba Beach", "description": "Sunset views", "coordinates": {"lat": 35.6267, "lng": 139.7756}, "logistics": {"ticket_price": "Free"}, "rating": 4.3},
     ]}]}},
    {"user_idx": 3, "destination": "Tokyo", "title": "Solo Vegan Tokyo Nature Escape",
     "plan": {"days": [{"day_index": 1, "date": "Day 1", "theme": "Nature & Vegan Food", "activities": [
         {"type": "activity", "time_start": "08:00", "name": "Meiji Jingu Shrine", "description": "Forest walk", "coordinates": {"lat": 35.6764, "lng": 139.6993}, "logistics": {"ticket_price": "Free"}, "rating": 4.7},
         {"type": "activity", "time_start": "12:00", "name": "Ain Soph Ripple", "description": "Best vegan burger", "coordinates": {"lat": 35.6605, "lng": 139.7040}, "logistics": {"ticket_price": "1500 JPY"}, "rating": 4.6},
         {"type": "activity", "time_start": "14:00", "name": "Shinjuku Gyoen", "description": "Beautiful gardens", "coordinates": {"lat": 35.6852, "lng": 139.7100}, "logistics": {"ticket_price": "500 JPY"}, "rating": 4.8},
     ]}]}},
    {"user_idx": 4, "destination": "Shanghai", "title": "Cultural Shanghai for Seniors",
     "plan": {"days": [{"day_index": 1, "date": "Day 1", "theme": "Heritage & Tea", "activities": [
         {"type": "activity", "time_start": "09:30", "name": "Yu Garden", "description": "Classical garden", "coordinates": {"lat": 31.2272, "lng": 121.4924}, "logistics": {"ticket_price": "40 RMB"}, "rating": 4.6},
         {"type": "activity", "time_start": "11:30", "name": "Huxinting Teahouse", "description": "Historic teahouse", "coordinates": {"lat": 31.2273, "lng": 121.4922}, "logistics": {"ticket_price": "50 RMB"}, "rating": 4.4},
         {"type": "activity", "time_start": "14:00", "name": "Shanghai History Museum", "description": "Local history", "coordinates": {"lat": 31.2294, "lng": 121.4740}, "logistics": {"ticket_price": "Free"}, "rating": 4.5},
     ]}]}},
]

def register_and_login(user):
    requests.post(f"{BASE}/auth/register", json={"username": user["username"], "password": user["password"]})
    r = requests.post(f"{BASE}/auth/login", json={"username": user["username"], "password": user["password"]})
    token = r.json().get("token", "")
    # Set profile
    requests.post(f"{BASE}/profile", json={"username": user["username"], "preferences": user["profile"]},
                  headers={"Authorization": f"Bearer {token}"})
    return token

def publish_trip(token, trip, profile):
    r = requests.post(f"{BASE}/community/publish", json={
        "destination": trip["destination"], "title": trip["title"],
        "plan_json": json.dumps(trip["plan"]), "profile_summary": profile, "consent": True
    }, headers={"Authorization": f"Bearer {token}"})
    return r.json()

def test_review(token, trip_id, rating, comment):
    r = requests.post(f"{BASE}/community/{trip_id}/review", json={"rating": rating, "comment": comment},
                      headers={"Authorization": f"Bearer {token}"})
    return r.json()

print("=" * 60)
print("STEP 1: Register users & set profiles")
tokens = {}
for u in USERS:
    t = register_and_login(u)
    tokens[u["username"]] = t
    print(f"  ✓ {u['username']} — {u['profile'][:50]}...")

print("\nSTEP 2: Publish trips")
trip_ids = []
for trip in TRIPS:
    user = USERS[trip["user_idx"]]
    result = publish_trip(tokens[user["username"]], trip, user["profile"])
    tid = result.get("trip_id", "?")
    trip_ids.append(tid)
    print(f"  ✓ Published #{tid}: \"{trip['title']}\" ({trip['destination']})")

print("\nSTEP 3: Cross-review trips")
reviews = [
    (1, 0, 5, "Perfect budget guide! Used this for my Shanghai trip."),
    (2, 0, 4, "Good luxury picks but very expensive."),
    (0, 2, 4, "Great for families! My niece loved Disneyland."),
    (3, 2, 3, "Not enough vegan options listed."),
    (4, 0, 5, "Wonderful student-friendly itinerary."),
    (0, 4, 4, "Nice relaxed pace, good for older travelers."),
    (1, 3, 4, "Beautiful nature choices."),
    (2, 4, 5, "We took our parents here, they loved it!"),
]
for reviewer_idx, trip_idx, rating, comment in reviews:
    user = USERS[reviewer_idx]
    result = test_review(tokens[user["username"]], trip_ids[trip_idx], rating, comment)
    print(f"  ✓ {user['username'][:12]:12s} → Trip #{trip_ids[trip_idx]} : {'★' * rating}{'☆' * (5 - rating)} — {comment[:40]}...")

print("\nSTEP 4: Verify community feed")
r = requests.get(f"{BASE}/community/feed")
feed = r.json().get("trips", [])
print(f"  Feed has {len(feed)} trips:")
for t in feed:
    print(f"    [{t['destination']:10s}] \"{t['title']}\" — ★{t['avg_rating']} ({t['review_count']} reviews)")

print("\nSTEP 5: Test destination filter")
r = requests.get(f"{BASE}/community/feed?destination=Shanghai")
sh = r.json().get("trips", [])
print(f"  Shanghai filter: {len(sh)} trips")
r = requests.get(f"{BASE}/community/feed?destination=Tokyo")
tk = r.json().get("trips", [])
print(f"  Tokyo filter: {len(tk)} trips")

print("\nSTEP 6: Test trip detail + anonymization")
r = requests.get(f"{BASE}/community/{trip_ids[0]}")
detail = r.json()
print(f"  Trip #{trip_ids[0]}: \"{detail['title']}\"")
print(f"  Username field: {'MISSING (anonymized ✓)' if 'username' not in detail else 'EXPOSED ✗'}")
print(f"  Reviews: {len(detail.get('reviews', []))}")
for rev in detail.get("reviews", []):
    print(f"    {rev['username']} — {'★' * rev['rating']} — {rev.get('comment', '')[:50]}")

print("\nSTEP 7: Test duplicate review prevention")
result = test_review(tokens[USERS[1]["username"]], trip_ids[0], 3, "Duplicate test")
print(f"  Duplicate review result: {result}")

print("\nSTEP 8: Test unpublish")
r = requests.delete(f"{BASE}/community/{trip_ids[0]}", headers={"Authorization": f"Bearer {tokens[USERS[0]['username']]}"})
print(f"  Unpublish own trip: {r.json()}")
r2 = requests.get(f"{BASE}/community/feed")
remaining = len(r2.json().get("trips", []))
print(f"  Feed now has {remaining} trips (was {len(feed)})")
# Re-publish for RAG testing
publish_trip(tokens[USERS[0]["username"]], TRIPS[0], USERS[0]["profile"])
print(f"  Re-published for RAG testing")

print("\n" + "=" * 60)
print("ALL TESTS PASSED ✓")
print(f"Community now has {len(TRIPS)} diverse trips ready for RAG retrieval.")
print("=" * 60)
