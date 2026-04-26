import asyncio
import httpx
import json

async def test():
    async with httpx.AsyncClient() as client:
        # Register a test user
        res = await client.post("http://localhost:8000/auth/register", json={"username": "TestUser99", "password": "password"})
        if res.status_code != 200 or "token" not in res.json():
            res = await client.post("http://localhost:8000/auth/login", json={"username": "TestUser99", "password": "password"})
        
        token = res.json()["token"]
        print("Token:", token)
        
        # Save a session
        payload = {
            "username": "TestUser99",
            "title": "My Test Trip",
            "history_json": json.dumps({"messages": [], "planHistory": [{"test": 1}]})
        }
        res2 = await client.post("http://localhost:8000/sessions", json=payload, headers={"Authorization": f"Bearer {token}"})
        print("Save Status:", res2.status_code)
        print("Save Response:", res2.text)
        
        # Get sessions
        res3 = await client.get("http://localhost:8000/sessions/TestUser99", headers={"Authorization": f"Bearer {token}"})
        print("Get Sessions:", res3.text)

asyncio.run(test())
