#!/usr/bin/env python3
"""
Backend API Testing for Developer Test Mode Feature Flag Guards
Tests feature flag enforcement for aiCommand, aiVideo, and premiumBackup
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3000/api"
ADMIN_TOKEN = "preview-demo-token"

def clear_cookies():
    """Helper: Clear all developer profile cookies"""
    print("\n=== Clearing developer profile cookies ===")
    try:
        response = requests.delete(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print("✅ Cookies cleared successfully")
            return True
        else:
            print(f"⚠️  Cookie clear returned {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Failed to clear cookies: {str(e)}")
        return False


def test_aicommand_flag_blocks_ai_os_status():
    """Test 1: POST profile with aiCommand:false blocks /api/ai-os/status"""
    print("\n=== Test 1: aiCommand:false blocks /api/ai-os/status ===")
    try:
        # Set profile with aiCommand disabled
        profile_response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Content-Type": "application/json"
            },
            json={
                "experience": "super_user",
                "featureFlags": {
                    "aiCommand": False
                }
            }
        )
        print(f"Profile set status: {profile_response.status_code}")
        assert profile_response.status_code == 200, f"Failed to set profile: {profile_response.status_code}"
        
        # Extract cookie
        cookie = profile_response.headers.get("Set-Cookie", "")
        print(f"Cookie set: {cookie[:100]}...")
        
        # Test /api/ai-os/status - should return 403 feature_disabled
        status_response = requests.get(
            f"{BASE_URL}/ai-os/status",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Cookie": cookie
            }
        )
        print(f"AI OS Status response: {status_response.status_code}")
        status_data = status_response.json()
        print(f"Response: {json.dumps(status_data, indent=2)}")
        
        assert status_response.status_code == 403, f"Expected 403, got {status_response.status_code}"
        assert "error" in status_data, "Expected error field in response"
        assert status_data["error"]["code"] == "feature_disabled", f"Expected feature_disabled, got {status_data['error']['code']}"
        assert "AI Command" in status_data["error"]["message"], "Error message should mention AI Command"
        
        print("✅ Test 1 PASSED: aiCommand:false blocks /api/ai-os/status with 403 feature_disabled")
        return cookie
    except Exception as e:
        print(f"❌ Test 1 FAILED: {str(e)}")
        return None


def test_aicommand_flag_blocks_ai_os_preview(cookie):
    """Test 2: POST profile with aiCommand:false blocks /api/ai-os/preview"""
    print("\n=== Test 2: aiCommand:false blocks /api/ai-os/preview ===")
    try:
        # Test /api/ai-os/preview - should return 403 feature_disabled
        preview_response = requests.post(
            f"{BASE_URL}/ai-os/preview",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Cookie": cookie,
                "Content-Type": "application/json"
            },
            json={
                "task": "Test AI task",
                "feature": "chat"
            }
        )
        print(f"AI OS Preview response: {preview_response.status_code}")
        preview_data = preview_response.json()
        print(f"Response: {json.dumps(preview_data, indent=2)}")
        
        assert preview_response.status_code == 403, f"Expected 403, got {preview_response.status_code}"
        assert "error" in preview_data, "Expected error field in response"
        assert preview_data["error"]["code"] == "feature_disabled", f"Expected feature_disabled, got {preview_data['error']['code']}"
        assert "AI Command" in preview_data["error"]["message"], "Error message should mention AI Command"
        
        print("✅ Test 2 PASSED: aiCommand:false blocks /api/ai-os/preview with 403 feature_disabled")
        return True
    except Exception as e:
        print(f"❌ Test 2 FAILED: {str(e)}")
        return False


def test_reset_restores_aicommand_access():
    """Test 3: DELETE cookie or super_user profile restores AI OS access"""
    print("\n=== Test 3: Reset restores AI OS access ===")
    try:
        # Clear cookies
        clear_response = requests.delete(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        print(f"Clear cookies status: {clear_response.status_code}")
        assert clear_response.status_code == 200, f"Failed to clear cookies: {clear_response.status_code}"
        
        # Test /api/ai-os/status - should now work
        status_response = requests.get(
            f"{BASE_URL}/ai-os/status",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        print(f"AI OS Status response after reset: {status_response.status_code}")
        status_data = status_response.json()
        print(f"Response: {json.dumps(status_data, indent=2)}")
        
        assert status_response.status_code == 200, f"Expected 200, got {status_response.status_code}"
        assert "ok" in status_data or "name" in status_data, "Expected successful response"
        
        print("✅ Test 3 PASSED: Reset restores AI OS access")
        return True
    except Exception as e:
        print(f"❌ Test 3 FAILED: {str(e)}")
        return False


def test_aivideo_flag_blocks_video_get():
    """Test 4: POST profile with aiVideo:false blocks /api/ai-os/video GET"""
    print("\n=== Test 4: aiVideo:false blocks /api/ai-os/video GET ===")
    try:
        # Set profile with aiVideo disabled
        profile_response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Content-Type": "application/json"
            },
            json={
                "experience": "super_user",
                "featureFlags": {
                    "aiVideo": False
                }
            }
        )
        print(f"Profile set status: {profile_response.status_code}")
        assert profile_response.status_code == 200, f"Failed to set profile: {profile_response.status_code}"
        
        # Extract cookie
        cookie = profile_response.headers.get("Set-Cookie", "")
        print(f"Cookie set: {cookie[:100]}...")
        
        # Test /api/ai-os/video GET - should return 403 feature_disabled
        video_response = requests.get(
            f"{BASE_URL}/ai-os/video",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Cookie": cookie
            }
        )
        print(f"AI OS Video GET response: {video_response.status_code}")
        video_data = video_response.json()
        print(f"Response: {json.dumps(video_data, indent=2)}")
        
        assert video_response.status_code == 403, f"Expected 403, got {video_response.status_code}"
        assert "error" in video_data, "Expected error field in response"
        assert video_data["error"]["code"] == "feature_disabled", f"Expected feature_disabled, got {video_data['error']['code']}"
        assert "AI Video" in video_data["error"]["message"], "Error message should mention AI Video"
        
        print("✅ Test 4 PASSED: aiVideo:false blocks /api/ai-os/video GET with 403 feature_disabled")
        return cookie
    except Exception as e:
        print(f"❌ Test 4 FAILED: {str(e)}")
        return None


def test_aivideo_flag_blocks_video_post(cookie):
    """Test 5: POST profile with aiVideo:false blocks /api/ai-os/video POST"""
    print("\n=== Test 5: aiVideo:false blocks /api/ai-os/video POST ===")
    try:
        # Test /api/ai-os/video POST - should return 403 feature_disabled
        video_response = requests.post(
            f"{BASE_URL}/ai-os/video",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Cookie": cookie,
                "Content-Type": "application/json"
            },
            json={
                "task": "Create a video",
                "action": "preview"
            }
        )
        print(f"AI OS Video POST response: {video_response.status_code}")
        video_data = video_response.json()
        print(f"Response: {json.dumps(video_data, indent=2)}")
        
        assert video_response.status_code == 403, f"Expected 403, got {video_response.status_code}"
        assert "error" in video_data, "Expected error field in response"
        assert video_data["error"]["code"] == "feature_disabled", f"Expected feature_disabled, got {video_data['error']['code']}"
        assert "AI Video" in video_data["error"]["message"], "Error message should mention AI Video"
        
        print("✅ Test 5 PASSED: aiVideo:false blocks /api/ai-os/video POST with 403 feature_disabled")
        return True
    except Exception as e:
        print(f"❌ Test 5 FAILED: {str(e)}")
        return False


def test_reset_restores_aivideo_access():
    """Test 6: Reset restores AI Video access"""
    print("\n=== Test 6: Reset restores AI Video access ===")
    try:
        # Clear cookies
        clear_response = requests.delete(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        print(f"Clear cookies status: {clear_response.status_code}")
        assert clear_response.status_code == 200, f"Failed to clear cookies: {clear_response.status_code}"
        
        # Test /api/ai-os/video GET - should now work
        video_response = requests.get(
            f"{BASE_URL}/ai-os/video",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        print(f"AI OS Video GET response after reset: {video_response.status_code}")
        video_data = video_response.json()
        print(f"Response: {json.dumps(video_data, indent=2)}")
        
        assert video_response.status_code == 200, f"Expected 200, got {video_response.status_code}"
        assert "ok" in video_data or "providers" in video_data, "Expected successful response"
        
        print("✅ Test 6 PASSED: Reset restores AI Video access")
        return True
    except Exception as e:
        print(f"❌ Test 6 FAILED: {str(e)}")
        return False


def test_premiumbackup_flag_blocks_insights():
    """Test 7: POST profile with premiumBackup:false blocks /api/insights"""
    print("\n=== Test 7: premiumBackup:false blocks /api/insights ===")
    try:
        # Set profile with premiumBackup disabled
        profile_response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Content-Type": "application/json"
            },
            json={
                "experience": "super_user",
                "featureFlags": {
                    "premiumBackup": False
                }
            }
        )
        print(f"Profile set status: {profile_response.status_code}")
        assert profile_response.status_code == 200, f"Failed to set profile: {profile_response.status_code}"
        
        # Extract cookie
        cookie = profile_response.headers.get("Set-Cookie", "")
        print(f"Cookie set: {cookie[:100]}...")
        
        # Test /api/insights - should return 403 feature_disabled
        insights_response = requests.get(
            f"{BASE_URL}/insights",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Cookie": cookie
            }
        )
        print(f"Insights response: {insights_response.status_code}")
        insights_data = insights_response.json()
        print(f"Response: {json.dumps(insights_data, indent=2)}")
        
        assert insights_response.status_code == 403, f"Expected 403, got {insights_response.status_code}"
        assert "error" in insights_data, "Expected error field in response"
        assert insights_data["error"]["code"] == "feature_disabled", f"Expected feature_disabled, got {insights_data['error']['code']}"
        assert "Premium Backup" in insights_data["error"]["message"], "Error message should mention Premium Backup"
        
        print("✅ Test 7 PASSED: premiumBackup:false blocks /api/insights with 403 feature_disabled")
        return cookie
    except Exception as e:
        print(f"❌ Test 7 FAILED: {str(e)}")
        return None


def test_premiumbackup_flag_blocks_insights_ai_summary(cookie):
    """Test 8: POST profile with premiumBackup:false blocks /api/insights/ai-summary"""
    print("\n=== Test 8: premiumBackup:false blocks /api/insights/ai-summary ===")
    try:
        # Test /api/insights/ai-summary - should return 403 feature_disabled
        summary_response = requests.post(
            f"{BASE_URL}/insights/ai-summary",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Cookie": cookie,
                "Content-Type": "application/json"
            },
            json={}
        )
        print(f"Insights AI Summary response: {summary_response.status_code}")
        summary_data = summary_response.json()
        print(f"Response: {json.dumps(summary_data, indent=2)}")
        
        assert summary_response.status_code == 403, f"Expected 403, got {summary_response.status_code}"
        assert "error" in summary_data, "Expected error field in response"
        assert summary_data["error"]["code"] == "feature_disabled", f"Expected feature_disabled, got {summary_data['error']['code']}"
        assert "Premium Backup" in summary_data["error"]["message"], "Error message should mention Premium Backup"
        
        print("✅ Test 8 PASSED: premiumBackup:false blocks /api/insights/ai-summary with 403 feature_disabled")
        return True
    except Exception as e:
        print(f"❌ Test 8 FAILED: {str(e)}")
        return False


def test_reset_restores_insights_access():
    """Test 9: Reset restores Insights access"""
    print("\n=== Test 9: Reset restores Insights access ===")
    try:
        # Clear cookies
        clear_response = requests.delete(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        print(f"Clear cookies status: {clear_response.status_code}")
        assert clear_response.status_code == 200, f"Failed to clear cookies: {clear_response.status_code}"
        
        # Test /api/insights - should now work
        insights_response = requests.get(
            f"{BASE_URL}/insights",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        print(f"Insights response after reset: {insights_response.status_code}")
        insights_data = insights_response.json()
        print(f"Response: {json.dumps(insights_data, indent=2)}")
        
        assert insights_response.status_code == 200, f"Expected 200, got {insights_response.status_code}"
        assert "totals" in insights_data or "plan" in insights_data, "Expected successful response with insights data"
        
        print("✅ Test 9 PASSED: Reset restores Insights access")
        return True
    except Exception as e:
        print(f"❌ Test 9 FAILED: {str(e)}")
        return False


def test_prior_matrix_behavior():
    """Test 10: Verify prior matrix behavior still passes"""
    print("\n=== Test 10: Verify prior matrix behavior (storage simulation, plan switching) ===")
    try:
        # Test storage simulation with 5GB
        profile_response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Content-Type": "application/json"
            },
            json={
                "experience": "free",
                "storage": "5gb"
            }
        )
        assert profile_response.status_code == 200, f"Failed to set profile: {profile_response.status_code}"
        cookie = profile_response.headers.get("Set-Cookie", "")
        
        # Test /api/storage/usage with simulated storage
        usage_response = requests.get(
            f"{BASE_URL}/storage/usage",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Cookie": cookie
            }
        )
        print(f"Storage usage response: {usage_response.status_code}")
        usage_data = usage_response.json()
        print(f"Response: {json.dumps(usage_data, indent=2)}")
        
        assert usage_response.status_code == 200, f"Expected 200, got {usage_response.status_code}"
        assert usage_data["plan"]["id"] == "free", f"Expected plan=free, got {usage_data['plan']['id']}"
        assert usage_data["storageSimulated"] == True, "Expected storageSimulated=true"
        assert usage_data["usage"]["bytes"] == 5 * 1024 ** 3, f"Expected 5GB simulated, got {usage_data['usage']['bytes']}"
        
        print("✅ Test 10a PASSED: Storage simulation working")
        
        # Test plan switching to plus
        profile_response = requests.post(
            f"{BASE_URL}/dev/effective-plan",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Content-Type": "application/json"
            },
            json={"experience": "plus"}
        )
        assert profile_response.status_code == 200, f"Failed to switch to plus: {profile_response.status_code}"
        cookie = profile_response.headers.get("Set-Cookie", "")
        
        usage_response = requests.get(
            f"{BASE_URL}/storage/usage",
            headers={
                "Authorization": f"Bearer {ADMIN_TOKEN}",
                "Cookie": cookie
            }
        )
        usage_data = usage_response.json()
        assert usage_data["plan"]["id"] == "plus", f"Expected plan=plus, got {usage_data['plan']['id']}"
        
        print("✅ Test 10b PASSED: Plan switching working")
        
        # Test DELETE clears cookies
        clear_response = requests.delete(
            f"{BASE_URL}/dev/effective-plan",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        assert clear_response.status_code == 200, f"Failed to clear cookies: {clear_response.status_code}"
        clear_data = clear_response.json()
        assert clear_data["overrideActive"] == False, "Expected overrideActive=false after DELETE"
        
        print("✅ Test 10c PASSED: DELETE cookie clearing working")
        
        # Test anonymous user blocked
        anon_response = requests.get(f"{BASE_URL}/dev/effective-plan")
        assert anon_response.status_code == 401, f"Expected 401 for anonymous, got {anon_response.status_code}"
        
        print("✅ Test 10d PASSED: Anonymous users blocked")
        
        # Test no DB mutation - verify user plan remains super_user
        me_response = requests.get(
            f"{BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
        )
        me_data = me_response.json()
        assert me_data["user"]["plan"] == "super_user", f"User plan should remain super_user, got {me_data['user']['plan']}"
        assert me_data["user"]["role"] == "admin", f"User role should remain admin, got {me_data['user']['role']}"
        
        print("✅ Test 10e PASSED: No DB/billing mutation")
        
        print("✅ Test 10 PASSED: All prior matrix behavior verified")
        return True
    except Exception as e:
        print(f"❌ Test 10 FAILED: {str(e)}")
        return False


def main():
    """Run all feature flag tests"""
    print("=" * 80)
    print("BACKEND FEATURE FLAG TESTING - Developer Test Mode")
    print("Testing aiCommand, aiVideo, and premiumBackup feature flag guards")
    print("=" * 80)
    
    results = []
    
    # Clear any existing cookies first
    clear_cookies()
    
    # Test aiCommand flag
    cookie = test_aicommand_flag_blocks_ai_os_status()
    results.append(("aiCommand blocks /api/ai-os/status", cookie is not None))
    
    if cookie:
        results.append(("aiCommand blocks /api/ai-os/preview", test_aicommand_flag_blocks_ai_os_preview(cookie)))
    
    results.append(("Reset restores AI OS access", test_reset_restores_aicommand_access()))
    
    # Test aiVideo flag
    cookie = test_aivideo_flag_blocks_video_get()
    results.append(("aiVideo blocks /api/ai-os/video GET", cookie is not None))
    
    if cookie:
        results.append(("aiVideo blocks /api/ai-os/video POST", test_aivideo_flag_blocks_video_post(cookie)))
    
    results.append(("Reset restores AI Video access", test_reset_restores_aivideo_access()))
    
    # Test premiumBackup flag
    cookie = test_premiumbackup_flag_blocks_insights()
    results.append(("premiumBackup blocks /api/insights", cookie is not None))
    
    if cookie:
        results.append(("premiumBackup blocks /api/insights/ai-summary", test_premiumbackup_flag_blocks_insights_ai_summary(cookie)))
    
    results.append(("Reset restores Insights access", test_reset_restores_insights_access()))
    
    # Test prior matrix behavior
    results.append(("Prior matrix behavior verified", test_prior_matrix_behavior()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed ({int(passed/total*100)}%)")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED! Feature flag guards working correctly.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Review output above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
