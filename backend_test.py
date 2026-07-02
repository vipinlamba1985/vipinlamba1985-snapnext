#!/usr/bin/env python3
"""
Quick backend verification for preview-demo-token super_user plan canonicalization
"""
import requests
import json

BASE_URL = "http://localhost:3000/api"
PREVIEW_TOKEN = "preview-demo-token"

def test_auth_me():
    """Test /api/auth/me returns correct super_user data"""
    print("\n=== Testing /api/auth/me ===")
    try:
        response = requests.get(
            f"{BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify expected fields
        user = data.get("user", {})
        checks = {
            "email": user.get("email") == "vipin.lamba1985@gmail.com",
            "role": user.get("role") == "admin",
            "plan": user.get("plan") == "super_user"
        }
        
        print(f"✅ Email correct: {checks['email']}")
        print(f"✅ Role correct: {checks['role']}")
        print(f"✅ Plan correct: {checks['plan']}")
        
        return all(checks.values()) and response.status_code == 200
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_storage_usage():
    """Test /api/storage/usage returns super_user plan data"""
    print("\n=== Testing /api/storage/usage ===")
    try:
        response = requests.get(
            f"{BASE_URL}/storage/usage",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify expected fields
        plan = data.get("plan", {})
        checks = {
            "plan.id": plan.get("id") == "super_user",
            "plan.name": plan.get("name") == "Super User",
            "effectivePlan": data.get("effectivePlan") == "super_user",
            "isSuper": data.get("isSuper") == True
        }
        
        print(f"✅ plan.id correct: {checks['plan.id']}")
        print(f"✅ plan.name correct: {checks['plan.name']}")
        print(f"✅ effectivePlan correct: {checks['effectivePlan']}")
        print(f"✅ isSuper correct: {checks['isSuper']}")
        
        return all(checks.values()) and response.status_code == 200
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_insights():
    """Test /api/insights returns super_user plan data"""
    print("\n=== Testing /api/insights ===")
    try:
        response = requests.get(
            f"{BASE_URL}/insights",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify expected fields - plan is an object
        plan = data.get("plan", {})
        checks = {
            "plan.name": plan.get("name") == "Super User",
            "plan.isSuper": plan.get("isSuper") == True
        }
        
        print(f"✅ plan.name correct: {checks['plan.name']}")
        print(f"✅ plan.isSuper correct: {checks['plan.isSuper']}")
        
        return all(checks.values()) and response.status_code == 200
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_ai_status():
    """Test /api/ai/status returns superUser true and plan super_user"""
    print("\n=== Testing /api/ai/status ===")
    try:
        response = requests.get(
            f"{BASE_URL}/ai/status?feature=caption",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify expected fields
        checks = {
            "superUser": data.get("superUser") == True,
            "plan": data.get("plan") == "super_user"
        }
        
        print(f"✅ superUser correct: {checks['superUser']}")
        print(f"✅ plan correct: {checks['plan']}")
        
        return all(checks.values()) and response.status_code == 200
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_admin_apis():
    """Test admin APIs return 200 for super_user"""
    print("\n=== Testing Admin APIs ===")
    results = []
    
    # Test /api/admin/users
    try:
        response = requests.get(
            f"{BASE_URL}/admin/users",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"/admin/users Status: {response.status_code}")
        results.append(response.status_code == 200)
        print(f"✅ /admin/users: {response.status_code == 200}")
    except Exception as e:
        print(f"❌ /admin/users Error: {e}")
        results.append(False)
    
    # Test /api/admin/grant-super (POST endpoint, just check it's accessible)
    try:
        response = requests.post(
            f"{BASE_URL}/admin/grant-super",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"},
            json={"email": "test@example.com"}
        )
        # Should return 200 or 400 (if user doesn't exist), not 403/401
        print(f"/admin/grant-super Status: {response.status_code}")
        results.append(response.status_code in [200, 400, 404])
        print(f"✅ /admin/grant-super accessible: {response.status_code in [200, 400, 404]}")
    except Exception as e:
        print(f"❌ /admin/grant-super Error: {e}")
        results.append(False)
    
    return all(results)

def test_anonymous_restrictions():
    """Test anonymous access returns 401/403"""
    print("\n=== Testing Anonymous Restrictions ===")
    results = []
    
    # Test /api/auth/me without token
    try:
        response = requests.get(f"{BASE_URL}/auth/me")
        print(f"/auth/me (no token) Status: {response.status_code}")
        results.append(response.status_code in [401, 403])
        print(f"✅ /auth/me blocked: {response.status_code in [401, 403]}")
    except Exception as e:
        print(f"❌ /auth/me Error: {e}")
        results.append(False)
    
    # Test /api/storage/usage without token
    try:
        response = requests.get(f"{BASE_URL}/storage/usage")
        print(f"/storage/usage (no token) Status: {response.status_code}")
        results.append(response.status_code in [401, 403])
        print(f"✅ /storage/usage blocked: {response.status_code in [401, 403]}")
    except Exception as e:
        print(f"❌ /storage/usage Error: {e}")
        results.append(False)
    
    # Test /api/admin/users without token
    try:
        response = requests.get(f"{BASE_URL}/admin/users")
        print(f"/admin/users (no token) Status: {response.status_code}")
        results.append(response.status_code in [401, 403])
        print(f"✅ /admin/users blocked: {response.status_code in [401, 403]}")
    except Exception as e:
        print(f"❌ /admin/users Error: {e}")
        results.append(False)
    
    return all(results)

def main():
    print("=" * 80)
    print("PREVIEW TOKEN SUPER_USER PLAN VERIFICATION")
    print("=" * 80)
    
    results = {
        "auth/me": test_auth_me(),
        "storage/usage": test_storage_usage(),
        "insights": test_insights(),
        "ai/status": test_ai_status(),
        "admin_apis": test_admin_apis(),
        "anonymous_restrictions": test_anonymous_restrictions()
    }
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    all_passed = all(results.values())
    print("\n" + "=" * 80)
    if all_passed:
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("=" * 80)
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    exit(main())
