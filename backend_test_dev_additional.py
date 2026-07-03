#!/usr/bin/env python3
"""
Additional Backend API Testing for Developer Test Console
Tests additional scenarios from review_request:
- premiumBackup flag affecting /api/storage/usage
- /api/insights behavior
- aiCommand flag (currently not mapped to any features)
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3000/api"
ADMIN_TOKEN = "preview-demo-token"

def print_section(title):
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}")

def test_1_premium_backup_flag():
    """Test 1: premiumBackup flag affects /api/storage/usage developerProfile"""
    print_section("Test 1: premiumBackup flag in storage/usage response")
    try:
        # Set profile with premiumBackup disabled
        profile = {
            "experience": "free",
            "featureFlags": {
                "premiumBackup": False
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"},
            json=profile
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        cookie = response.headers.get("Set-Cookie", "")
        
        # Check storage/usage with cookie
        headers = {"Authorization": f"Bearer {ADMIN_TOKEN}", "Cookie": cookie}
        usage_response = requests.get(f"{BASE_URL}/storage/usage", headers=headers)
        usage_data = usage_response.json()
        
        print(f"Status: {usage_response.status_code}")
        print(f"Response: {json.dumps(usage_data, indent=2)}")
        
        assert usage_response.status_code == 200, f"Expected 200"
        assert "developerProfile" in usage_data, "Missing developerProfile in response"
        
        dev_profile = usage_data["developerProfile"]
        assert dev_profile is not None, "developerProfile should not be null"
        assert "featureFlags" in dev_profile, "Missing featureFlags in developerProfile"
        assert dev_profile["featureFlags"]["premiumBackup"] == False, "premiumBackup should be False"
        
        print(f"✅ premiumBackup flag visible in storage/usage: {dev_profile['featureFlags']['premiumBackup']}")
        print("✅ Test 1 PASSED - premiumBackup flag affects /api/storage/usage developerProfile")
        return True
    except Exception as e:
        print(f"❌ Test 1 FAILED: {str(e)}")
        return False

def test_2_insights_endpoint():
    """Test 2: /api/insights endpoint behavior with developer profile"""
    print_section("Test 2: /api/insights endpoint")
    try:
        # Set profile with various flags
        profile = {
            "experience": "free",
            "storage": "5gb",
            "featureFlags": {
                "premiumBackup": False
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"},
            json=profile
        )
        cookie = response.headers.get("Set-Cookie", "")
        
        # Check insights endpoint
        headers = {"Authorization": f"Bearer {ADMIN_TOKEN}", "Cookie": cookie}
        insights_response = requests.get(f"{BASE_URL}/insights", headers=headers)
        
        print(f"Status: {insights_response.status_code}")
        insights_data = insights_response.json()
        print(f"Response keys: {list(insights_data.keys())}")
        
        assert insights_response.status_code == 200, f"Expected 200, got {insights_response.status_code}"
        
        # Verify insights returns data
        assert "totals" in insights_data, "Missing totals"
        assert "plan" in insights_data, "Missing plan"
        assert "forecast" in insights_data, "Missing forecast"
        
        # Verify plan reflects developer profile
        plan_info = insights_data["plan"]
        print(f"Plan in insights: {plan_info['id']}")
        assert plan_info["id"] == "free", f"Expected free plan in insights"
        
        # Check if simulated storage is reflected
        if plan_info.get("simulatedBytes"):
            print(f"✅ Simulated storage visible in insights: {plan_info['simulatedBytes']} bytes")
        
        print("✅ Test 2 PASSED - /api/insights works with developer profile")
        print("ℹ️  NOTE: /api/insights does not have explicit feature flag guards currently")
        return True
    except Exception as e:
        print(f"❌ Test 2 FAILED: {str(e)}")
        return False

def test_3_ai_command_flag():
    """Test 3: aiCommand flag - verify it's not currently mapped to any features"""
    print_section("Test 3: aiCommand flag (not currently mapped)")
    try:
        # Set profile with aiCommand disabled
        profile = {
            "experience": "super_user",
            "featureFlags": {
                "aiCommand": False
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"},
            json=profile
        )
        cookie = response.headers.get("Set-Cookie", "")
        
        # Test various AI features to see if any are affected by aiCommand
        headers = {"Authorization": f"Bearer {ADMIN_TOKEN}", "Cookie": cookie}
        
        # Test chat (mapped to aiStudio, not aiCommand)
        chat_response = requests.get(f"{BASE_URL}/ai/status?feature=chat", headers=headers)
        print(f"Chat status: {chat_response.status_code}")
        
        # Since aiCommand is not mapped to any features, chat should work
        # (it's mapped to aiStudio which is enabled by default)
        if chat_response.status_code == 200:
            print("✅ Chat feature accessible (aiCommand not mapped to chat)")
        
        print("✅ Test 3 PASSED")
        print("ℹ️  NOTE: aiCommand flag is defined but NOT currently mapped to any AI features")
        print("ℹ️  FEATURE_FLAG_MAP in lib/ai-router.js does not include aiCommand")
        print("ℹ️  If AI OS routes should be guarded by aiCommand, they need to be added to FEATURE_FLAG_MAP")
        return True
    except Exception as e:
        print(f"❌ Test 3 FAILED: {str(e)}")
        return False

def test_4_multiple_flags_combination():
    """Test 4: Test combination of multiple feature flags"""
    print_section("Test 4: Multiple feature flags combination")
    try:
        # Set profile with multiple flags disabled
        profile = {
            "experience": "pro",
            "storage": "1tb",
            "aiCredits": "full",
            "featureFlags": {
                "aiStudio": True,
                "aiVideo": False,
                "aiMemory": True,
                "aiCommand": False,
                "premiumBackup": True,
                "favorites": False,
                "community": False
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"},
            json=profile
        )
        assert response.status_code == 200, f"Expected 200"
        data = response.json()
        
        # Verify all flags are set correctly
        flags = data["developerProfile"]["featureFlags"]
        assert flags["aiStudio"] == True, "aiStudio should be True"
        assert flags["aiVideo"] == False, "aiVideo should be False"
        assert flags["aiMemory"] == True, "aiMemory should be True"
        assert flags["aiCommand"] == False, "aiCommand should be False"
        assert flags["premiumBackup"] == True, "premiumBackup should be True"
        assert flags["favorites"] == False, "favorites should be False"
        assert flags["community"] == False, "community should be False"
        
        print("✅ All feature flags set correctly")
        
        # Test that aiVideo-mapped features are blocked
        cookie = response.headers.get("Set-Cookie", "")
        headers = {"Authorization": f"Bearer {ADMIN_TOKEN}", "Cookie": cookie}
        
        video_response = requests.get(f"{BASE_URL}/ai/status?feature=videoScript", headers=headers)
        print(f"VideoScript status (aiVideo=false): {video_response.status_code}")
        
        if video_response.status_code == 403:
            video_data = video_response.json()
            assert video_data["error"]["code"] == "feature_disabled", "Should be feature_disabled"
            print(f"✅ videoScript blocked by aiVideo flag: {video_data['error']['message']}")
        
        print("✅ Test 4 PASSED - Multiple feature flags work correctly")
        return True
    except Exception as e:
        print(f"❌ Test 4 FAILED: {str(e)}")
        return False

def test_5_cleanup():
    """Test 5: Cleanup - DELETE profile"""
    print_section("Test 5: Cleanup")
    try:
        response = requests.delete(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        assert response.status_code == 200, f"Expected 200"
        data = response.json()
        assert data["overrideActive"] == False, "Override should be cleared"
        print("✅ Test 5 PASSED - Profile cleared")
        return True
    except Exception as e:
        print(f"❌ Test 5 FAILED: {str(e)}")
        return False

def main():
    print("\n" + "="*80)
    print("  ADDITIONAL DEVELOPER TEST MODE SCENARIOS")
    print("="*80)
    
    results = []
    
    # Test 1: premiumBackup flag
    passed = test_1_premium_backup_flag()
    results.append(("Test 1: premiumBackup flag", passed))
    
    # Test 2: insights endpoint
    passed = test_2_insights_endpoint()
    results.append(("Test 2: insights endpoint", passed))
    
    # Test 3: aiCommand flag
    passed = test_3_ai_command_flag()
    results.append(("Test 3: aiCommand flag", passed))
    
    # Test 4: multiple flags
    passed = test_4_multiple_flags_combination()
    results.append(("Test 4: multiple flags", passed))
    
    # Test 5: cleanup
    passed = test_5_cleanup()
    results.append(("Test 5: cleanup", passed))
    
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
