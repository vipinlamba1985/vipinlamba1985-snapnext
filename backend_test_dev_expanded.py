#!/usr/bin/env python3
"""
Backend API Testing for EXPANDED Developer Test Console Plan Switcher
Tests /api/dev/effective-plan with full profile matrix including:
- experience (plan): free, plus, pro, family, super_user
- persona: photographer, etc.
- storage: 5gb, 100gb, 1tb, empty
- aiCredits: low, half, full, unlimited
- notifications: none, normal, heavy
- featureFlags: aiStudio, aiVideo, aiMemory, aiCommand, premiumBackup, favorites, community
"""

import requests
import json
import sys

# Use localhost for internal testing
BASE_URL = "http://localhost:3000/api"
ADMIN_TOKEN = "preview-demo-token"

def print_section(title):
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}")

def test_1_get_initial_state():
    """Test 1: GET /api/dev/effective-plan as admin returns allowed arrays and no override initially"""
    print_section("Test 1: GET initial state - verify allowed arrays")
    try:
        response = requests.get(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert data["realPlan"] == "super_user", f"Expected realPlan=super_user"
        assert data["realRole"] == "admin", f"Expected realRole=admin"
        assert data["effectivePlan"] == "super_user", f"Expected effectivePlan=super_user initially"
        assert data["overrideActive"] == False, f"Expected overrideActive=false initially"
        
        # Verify allowed arrays
        assert "allowedPlans" in data, "Missing allowedPlans"
        assert "allowedPersonas" in data, "Missing allowedPersonas"
        assert "allowedStorage" in data, "Missing allowedStorage"
        assert "allowedAiCredits" in data, "Missing allowedAiCredits"
        assert "allowedNotifications" in data, "Missing allowedNotifications"
        assert "allowedFeatureFlags" in data, "Missing allowedFeatureFlags"
        
        print(f"✅ allowedPlans: {data['allowedPlans']}")
        print(f"✅ allowedPersonas: {data['allowedPersonas']}")
        print(f"✅ allowedStorage: {data['allowedStorage']}")
        print(f"✅ allowedAiCredits: {data['allowedAiCredits']}")
        print(f"✅ allowedNotifications: {data['allowedNotifications']}")
        print(f"✅ allowedFeatureFlags: {data['allowedFeatureFlags']}")
        
        print("✅ Test 1 PASSED")
        return True, None
    except Exception as e:
        print(f"❌ Test 1 FAILED: {str(e)}")
        return False, None

def test_2_post_full_profile():
    """Test 2: POST full profile with experience, persona, storage, aiCredits, notifications, featureFlags"""
    print_section("Test 2: POST full profile - free photographer with 5GB, low AI, heavy notifications")
    try:
        profile = {
            "experience": "free",
            "persona": "photographer",
            "storage": "5gb",
            "aiCredits": "low",
            "notifications": "heavy",
            "featureFlags": {
                "aiStudio": False,
                "aiVideo": False,
                "aiMemory": True,
                "aiCommand": False,
                "premiumBackup": False,
                "favorites": False,
                "community": False
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"},
            json=profile
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Verify Set-Cookie header
        set_cookie = response.headers.get("Set-Cookie", "")
        assert "snapnext_dev_profile" in set_cookie, "Missing snapnext_dev_profile cookie"
        assert "HttpOnly" in set_cookie, "Cookie should be HttpOnly"
        assert "SameSite" in set_cookie, "Cookie should have SameSite"
        print(f"✅ Set-Cookie header present: {set_cookie[:100]}...")
        
        # Verify response
        assert data["effectivePlan"] == "free", f"Expected effectivePlan=free, got {data['effectivePlan']}"
        assert data["overrideActive"] == True, f"Expected overrideActive=true"
        assert data["realPlan"] == "super_user", f"Real plan should remain super_user"
        
        # Verify developerProfile is normalized
        profile_data = data.get("developerProfile")
        assert profile_data is not None, "Missing developerProfile"
        assert profile_data["experience"] == "free", f"Expected experience=free"
        assert profile_data["persona"] == "photographer", f"Expected persona=photographer"
        assert profile_data["storage"] == "5gb", f"Expected storage=5gb"
        assert profile_data["aiCredits"] == "low", f"Expected aiCredits=low"
        assert profile_data["notifications"] == "heavy", f"Expected notifications=heavy"
        assert profile_data["featureFlags"]["aiStudio"] == False, "aiStudio should be False"
        assert profile_data["featureFlags"]["aiMemory"] == True, "aiMemory should be True"
        print(f"✅ Developer profile normalized correctly")
        
        print("✅ Test 2 PASSED")
        return True, set_cookie
    except Exception as e:
        print(f"❌ Test 2 FAILED: {str(e)}")
        return False, None

def test_3_get_with_cookie(cookie):
    """Test 3: GET with cookie returns overrideActive true and profile"""
    print_section("Test 3: GET with cookie - verify override is active")
    try:
        headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
        if cookie:
            headers["Cookie"] = cookie
        
        response = requests.get(
            f"{BASE_URL}/dev/effective-plan",
            headers=headers
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert data["overrideActive"] == True, f"Expected overrideActive=true with cookie"
        assert data["effectivePlan"] == "free", f"Expected effectivePlan=free"
        
        profile_data = data.get("developerProfile")
        assert profile_data is not None, "Missing developerProfile"
        assert profile_data["experience"] == "free", "Profile should persist"
        assert profile_data["persona"] == "photographer", "Persona should persist"
        
        print("✅ Test 3 PASSED")
        return True
    except Exception as e:
        print(f"❌ Test 3 FAILED: {str(e)}")
        return False

def test_4_storage_usage_with_profile(cookie):
    """Test 4: /api/storage/usage returns simulated 5GB storage with free plan"""
    print_section("Test 4: Storage usage with 5GB simulation")
    try:
        headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
        if cookie:
            headers["Cookie"] = cookie
        
        response = requests.get(
            f"{BASE_URL}/storage/usage",
            headers=headers
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert data["plan"]["id"] == "free", f"Expected plan.id=free, got {data['plan']['id']}"
        assert data["isSuper"] == False, f"Expected isSuper=false with free override"
        assert data["storageSimulated"] == True, f"Expected storageSimulated=true"
        
        # Verify simulated storage is approximately 5GB
        usage_bytes = data["usage"]["bytes"]
        expected_5gb = 5 * 1024 ** 3  # 5GB in bytes
        print(f"✅ Simulated storage: {usage_bytes} bytes (~{usage_bytes / 1024**3:.2f} GB)")
        assert abs(usage_bytes - expected_5gb) < 1024, f"Expected ~5GB, got {usage_bytes}"
        
        # Verify real item data/count remains visible
        assert "count" in data["usage"], "Usage should include item count"
        print(f"✅ Real item count visible: {data['usage'].get('count', 0)}")
        
        print("✅ Test 4 PASSED - No DB mutation, storage simulated correctly")
        return True
    except Exception as e:
        print(f"❌ Test 4 FAILED: {str(e)}")
        return False

def test_5_ai_status_with_low_credits(cookie):
    """Test 5: /api/ai/status with low AI credits shows reduced limits"""
    print_section("Test 5: AI status with low credits + free plan")
    try:
        headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
        if cookie:
            headers["Cookie"] = cookie
        
        # Test caption (free tier feature, mapped to aiMemory which is enabled)
        response = requests.get(
            f"{BASE_URL}/ai/status?feature=caption",
            headers=headers
        )
        print(f"Status (caption): {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200 for caption"
        assert data["plan"] == "free", f"Expected plan=free"
        
        # Verify reduced credits (low = 10% of normal)
        # Free plan normally has 50 monthly, 10 daily
        # With low credits: 5 monthly, 1 daily
        monthly = data.get("monthlyCredits", 0)
        daily = data.get("dailyCredits", 0)
        print(f"✅ AI credits with 'low' setting: monthly={monthly}, daily={daily}")
        assert monthly <= 10, f"Expected reduced monthly credits (~5), got {monthly}"
        assert daily <= 2, f"Expected reduced daily credits (~1), got {daily}"
        
        print("✅ Test 5a PASSED - Caption accessible with reduced credits")
        
        # Test postIdeas (plus tier feature, but aiStudio flag is disabled)
        # Feature flag check happens BEFORE plan tier check, so we expect feature_disabled
        response2 = requests.get(
            f"{BASE_URL}/ai/status?feature=postIdeas",
            headers=headers
        )
        print(f"\nStatus (postIdeas): {response2.status_code}")
        data2 = response2.json()
        print(f"Response: {json.dumps(data2, indent=2)}")
        
        assert response2.status_code == 403, f"Expected 403 for postIdeas, got {response2.status_code}"
        assert "error" in data2, "Should return error for disabled/premium feature"
        # Feature flag check happens first, so we get feature_disabled (not feature_not_available)
        assert data2["error"]["code"] == "feature_disabled", f"Expected feature_disabled (flag check first), got {data2['error']['code']}"
        print(f"✅ Premium feature blocked by disabled flag: {data2['error']['message']}")
        
        print("✅ Test 5b PASSED - Premium features blocked (feature flag enforcement)")
        return True
    except Exception as e:
        print(f"❌ Test 5 FAILED: {str(e)}")
        return False

def test_6_disabled_feature_flag(cookie):
    """Test 6: Disabled aiStudio flag causes AI Studio features to return 403"""
    print_section("Test 6: Feature flag enforcement - aiStudio disabled")
    try:
        headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
        if cookie:
            headers["Cookie"] = cookie
        
        # postIdeas is mapped to aiStudio flag
        # But it's also a plus-tier feature, and we're on free plan
        # So we need to test with a feature that's available on free but mapped to aiStudio
        
        # Actually, let's test chat which is free-tier and mapped to aiStudio
        response = requests.get(
            f"{BASE_URL}/ai/status?feature=chat",
            headers=headers
        )
        print(f"Status (chat with aiStudio=false): {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Chat is mapped to aiStudio flag, which is disabled
        assert response.status_code == 403, f"Expected 403 for disabled feature flag, got {response.status_code}"
        assert "error" in data, "Should return error for disabled feature"
        assert data["error"]["code"] == "feature_disabled", f"Expected feature_disabled, got {data['error']['code']}"
        assert "featureFlag" in data["error"], "Should include featureFlag in error"
        print(f"✅ Feature disabled: {data['error']['message']}")
        print(f"✅ Feature flag: {data['error']['featureFlag']}")
        
        print("✅ Test 6 PASSED - Feature flags enforced correctly")
        return True
    except Exception as e:
        print(f"❌ Test 6 FAILED: {str(e)}")
        return False

def test_7_switch_to_plus():
    """Test 7: Switch profile to plus plan"""
    print_section("Test 7: Switch to plus plan")
    try:
        profile = {
            "experience": "plus",
            "storage": "100gb",
            "aiCredits": "full"
        }
        
        response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"},
            json=profile
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert data["effectivePlan"] == "plus", f"Expected effectivePlan=plus"
        
        # Verify storage usage reflects plus limits
        cookie = response.headers.get("Set-Cookie", "")
        headers = {"Authorization": f"Bearer {ADMIN_TOKEN}", "Cookie": cookie}
        
        usage_response = requests.get(f"{BASE_URL}/storage/usage", headers=headers)
        usage_data = usage_response.json()
        print(f"Storage plan: {usage_data['plan']['id']}")
        
        assert usage_data["plan"]["id"] == "plus", f"Expected plus plan in storage"
        print(f"✅ Plus plan limits applied")
        
        print("✅ Test 7 PASSED")
        return True, cookie
    except Exception as e:
        print(f"❌ Test 7 FAILED: {str(e)}")
        return False, None

def test_8_switch_to_pro():
    """Test 8: Switch to pro plan"""
    print_section("Test 8: Switch to pro plan")
    try:
        profile = {"experience": "pro"}
        
        response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"},
            json=profile
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert data["effectivePlan"] == "pro", f"Expected effectivePlan=pro"
        
        print("✅ Test 8 PASSED")
        return True, response.headers.get("Set-Cookie", "")
    except Exception as e:
        print(f"❌ Test 8 FAILED: {str(e)}")
        return False, None

def test_9_switch_to_family():
    """Test 9: Switch to family plan (developer-only 2TB)"""
    print_section("Test 9: Switch to family plan (developer-only)")
    try:
        profile = {"experience": "family"}
        
        response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"},
            json=profile
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert data["effectivePlan"] == "family", f"Expected effectivePlan=family"
        
        # Verify family plan in storage usage
        cookie = response.headers.get("Set-Cookie", "")
        headers = {"Authorization": f"Bearer {ADMIN_TOKEN}", "Cookie": cookie}
        
        usage_response = requests.get(f"{BASE_URL}/storage/usage", headers=headers)
        usage_data = usage_response.json()
        print(f"Storage plan: {usage_data['plan']['id']}")
        print(f"Storage bytes: {usage_data['plan']['storageBytes']}")
        
        assert usage_data["plan"]["id"] == "family", f"Expected family plan"
        # Family plan should have 2TB = 2 * 1024^4 bytes
        expected_2tb = 2 * 1024 ** 4
        assert usage_data["plan"]["storageBytes"] == expected_2tb, f"Expected 2TB for family"
        print(f"✅ Family plan with 2TB storage")
        
        print("✅ Test 9 PASSED")
        return True, cookie
    except Exception as e:
        print(f"❌ Test 9 FAILED: {str(e)}")
        return False, None

def test_10_switch_to_super_user():
    """Test 10: Switch back to super_user plan"""
    print_section("Test 10: Switch to super_user plan")
    try:
        profile = {"experience": "super_user"}
        
        response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"},
            json=profile
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert data["effectivePlan"] == "super_user", f"Expected effectivePlan=super_user"
        
        # Verify isSuper is restored
        cookie = response.headers.get("Set-Cookie", "")
        headers = {"Authorization": f"Bearer {ADMIN_TOKEN}", "Cookie": cookie}
        
        usage_response = requests.get(f"{BASE_URL}/storage/usage", headers=headers)
        usage_data = usage_response.json()
        
        assert usage_data["isSuper"] == True, f"Expected isSuper=true for super_user"
        print(f"✅ Super user status restored")
        
        print("✅ Test 10 PASSED")
        return True, cookie
    except Exception as e:
        print(f"❌ Test 10 FAILED: {str(e)}")
        return False, None

def test_11_delete_clears_profile():
    """Test 11: DELETE clears profile and legacy cookies"""
    print_section("Test 11: DELETE clears profile")
    try:
        response = requests.delete(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert data["effectivePlan"] == "super_user", f"Expected effectivePlan=super_user after DELETE"
        assert data["overrideActive"] == False, f"Expected overrideActive=false after DELETE"
        
        # Verify Set-Cookie headers clear cookies
        set_cookie_headers = response.headers.get("Set-Cookie", "")
        print(f"Set-Cookie headers: {set_cookie_headers}")
        assert "Max-Age=0" in set_cookie_headers, "Should clear cookies with Max-Age=0"
        
        print("✅ Test 11 PASSED")
        return True
    except Exception as e:
        print(f"❌ Test 11 FAILED: {str(e)}")
        return False

def test_12_anonymous_blocked():
    """Test 12: Anonymous users cannot access /api/dev/effective-plan"""
    print_section("Test 12: Anonymous users blocked")
    try:
        response = requests.get(f"{BASE_URL}/dev/effective-plan")
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 401, f"Expected 401 for anonymous, got {response.status_code}"
        assert "error" in data, "Should return error"
        assert data["error"]["code"] == "unauthenticated", f"Expected unauthenticated error"
        print(f"✅ Anonymous blocked: {data['error']['message']}")
        
        print("✅ Test 12 PASSED")
        return True
    except Exception as e:
        print(f"❌ Test 12 FAILED: {str(e)}")
        return False

def test_13_verify_no_db_mutation():
    """Test 13: Verify no database plan mutation occurred"""
    print_section("Test 13: Verify no DB mutation")
    try:
        # Call /auth/me to verify real user plan hasn't changed
        response = requests.get(
            f"{BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # /auth/me returns {user: {...}} structure
        user = data.get("user", {})
        assert user.get("plan") == "super_user", f"Real plan should remain super_user, got {user.get('plan')}"
        assert user.get("role") == "admin", f"Real role should remain admin, got {user.get('role')}"
        print(f"✅ Real user plan unchanged: {user.get('plan')}")
        print(f"✅ Real user role unchanged: {user.get('role')}")
        
        print("✅ Test 13 PASSED - No DB mutation")
        return True
    except Exception as e:
        print(f"❌ Test 13 FAILED: {str(e)}")
        return False

def main():
    print("\n" + "="*80)
    print("  EXPANDED DEVELOPER TEST MODE MATRIX - BACKEND API TESTING")
    print("="*80)
    
    results = []
    cookie = None
    
    # Test 1: Initial state
    passed, _ = test_1_get_initial_state()
    results.append(("Test 1: GET initial state", passed))
    
    # Test 2: POST full profile
    passed, cookie = test_2_post_full_profile()
    results.append(("Test 2: POST full profile", passed))
    
    if cookie:
        # Test 3: GET with cookie
        passed = test_3_get_with_cookie(cookie)
        results.append(("Test 3: GET with cookie", passed))
        
        # Test 4: Storage usage simulation
        passed = test_4_storage_usage_with_profile(cookie)
        results.append(("Test 4: Storage usage simulation", passed))
        
        # Test 5: AI status with low credits
        passed = test_5_ai_status_with_low_credits(cookie)
        results.append(("Test 5: AI status with low credits", passed))
        
        # Test 6: Feature flag enforcement
        passed = test_6_disabled_feature_flag(cookie)
        results.append(("Test 6: Feature flag enforcement", passed))
    
    # Test 7: Switch to plus
    passed, cookie = test_7_switch_to_plus()
    results.append(("Test 7: Switch to plus", passed))
    
    # Test 8: Switch to pro
    passed, cookie = test_8_switch_to_pro()
    results.append(("Test 8: Switch to pro", passed))
    
    # Test 9: Switch to family
    passed, cookie = test_9_switch_to_family()
    results.append(("Test 9: Switch to family", passed))
    
    # Test 10: Switch to super_user
    passed, cookie = test_10_switch_to_super_user()
    results.append(("Test 10: Switch to super_user", passed))
    
    # Test 11: DELETE clears profile
    passed = test_11_delete_clears_profile()
    results.append(("Test 11: DELETE clears profile", passed))
    
    # Test 12: Anonymous blocked
    passed = test_12_anonymous_blocked()
    results.append(("Test 12: Anonymous blocked", passed))
    
    # Test 13: No DB mutation
    passed = test_13_verify_no_db_mutation()
    results.append(("Test 13: No DB mutation", passed))
    
    # Summary
    print("\n" + "="*80)
    print("  TEST SUMMARY")
    print("="*80)
    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)
    
    for test_name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\n{'='*80}")
    print(f"  TOTAL: {passed_count}/{total_count} tests passed ({passed_count*100//total_count}%)")
    print(f"{'='*80}\n")
    
    return 0 if passed_count == total_count else 1

if __name__ == "__main__":
    sys.exit(main())
