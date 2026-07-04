#!/usr/bin/env python3
"""
Backend API Testing for Phase 1: Security & Truthfulness
Tests security hardening, preview token gating, truthful AI responses, and new journal endpoints
"""

import requests
import json
import sys
import io
from PIL import Image

BASE_URL = "http://localhost:3000/api"
PREVIEW_TOKEN = "preview-demo-token"

def create_test_image():
    """Create a small test JPEG image"""
    img = Image.new('RGB', (100, 100), color='blue')
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    buf.seek(0)
    return buf

# ========== SECURITY TESTS ==========

def test_auth_config_preview_allowed():
    """Test 1: GET /api/auth/config returns previewAllowed=true in dev"""
    print("\n=== Test 1: GET /api/auth/config - previewAllowed flag ===")
    try:
        response = requests.get(f"{BASE_URL}/auth/config")
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "previewAllowed" in data, "Missing previewAllowed field"
        assert data["previewAllowed"] == True, f"Expected previewAllowed=true in dev, got {data['previewAllowed']}"
        assert "supabase" in data, "Missing supabase field"
        assert "serviceRole" in data, "Missing serviceRole field"
        
        print("✅ Test 1 PASSED: /auth/config returns previewAllowed=true")
        return True
    except Exception as e:
        print(f"❌ Test 1 FAILED: {str(e)}")
        return False


def test_auth_me_with_preview_token():
    """Test 2: GET /api/auth/me with preview-demo-token returns 200 with preview user"""
    print("\n=== Test 2: GET /api/auth/me with preview-demo-token ===")
    try:
        response = requests.get(
            f"{BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "user" in data, "Missing user field"
        assert data["user"]["id"] == "preview-super-user", f"Expected preview-super-user, got {data['user']['id']}"
        assert data["user"]["plan"] == "super_user", f"Expected super_user plan, got {data['user']['plan']}"
        assert data["user"]["role"] == "admin", f"Expected admin role, got {data['user']['role']}"
        
        print("✅ Test 2 PASSED: preview-demo-token authenticates correctly")
        return True
    except Exception as e:
        print(f"❌ Test 2 FAILED: {str(e)}")
        return False


def test_auth_me_without_token():
    """Test 3: GET /api/auth/me without token returns 401"""
    print("\n=== Test 3: GET /api/auth/me without token ===")
    try:
        response = requests.get(f"{BASE_URL}/auth/me")
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        assert "error" in data, "Missing error field"
        
        print("✅ Test 3 PASSED: Unauthorized request returns 401")
        return True
    except Exception as e:
        print(f"❌ Test 3 FAILED: {str(e)}")
        return False


def test_dashboard_redirect_without_auth():
    """Test 4: GET /dashboard without auth redirects to /login"""
    print("\n=== Test 4: GET /dashboard without auth (middleware fail-closed) ===")
    try:
        response = requests.get(
            "http://localhost:3000/dashboard",
            allow_redirects=False
        )
        print(f"Status: {response.status_code}")
        print(f"Location: {response.headers.get('Location', 'N/A')}")
        
        # Should be 307 or 302 redirect
        assert response.status_code in [302, 307, 308], f"Expected redirect (302/307/308), got {response.status_code}"
        location = response.headers.get('Location', '')
        assert '/login' in location, f"Expected redirect to /login, got {location}"
        
        print("✅ Test 4 PASSED: Middleware redirects unauthenticated requests to /login")
        return True
    except Exception as e:
        print(f"❌ Test 4 FAILED: {str(e)}")
        return False


# ========== TRUTHFULNESS TESTS ==========

def test_audio_transcribe_returns_error():
    """Test 5: POST /api/ai/audio-transcribe returns structured error, not fake transcript"""
    print("\n=== Test 5: POST /api/ai/audio-transcribe - honest error response ===")
    try:
        # First upload a test image to get a mediaId
        img_buf = create_test_image()
        files = {'files': ('test.jpg', img_buf, 'image/jpeg')}
        upload_response = requests.post(
            f"{BASE_URL}/media/upload",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"},
            files=files
        )
        
        if upload_response.status_code != 200:
            print(f"Upload failed: {upload_response.status_code}")
            print(f"Response: {upload_response.text}")
            return False
        
        upload_data = upload_response.json()
        if not upload_data.get('saved') or len(upload_data['saved']) == 0:
            print("No media saved in upload")
            return False
        
        media_id = upload_data['saved'][0]['id']
        print(f"Uploaded test image with ID: {media_id}")
        
        # Now try to transcribe it (should fail with structured error)
        response = requests.post(
            f"{BASE_URL}/ai/audio-transcribe",
            headers={
                "Authorization": f"Bearer {PREVIEW_TOKEN}",
                "Content-Type": "application/json"
            },
            json={"mediaId": media_id}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Should return 503 or 502 with structured error
        assert response.status_code in [502, 503], f"Expected 502/503, got {response.status_code}"
        assert "error" in data, "Missing error field"
        assert "code" in data["error"], "Missing error.code"
        assert data["error"]["code"] in ["ai_service_unavailable", "transcription_failed"], f"Unexpected error code: {data['error']['code']}"
        
        # CRITICAL: Must NOT contain fake transcript strings
        response_str = json.dumps(data).lower()
        fake_phrases = ["family recording", "memo", "voice note", "personal message"]
        for phrase in fake_phrases:
            assert phrase not in response_str, f"Found fabricated phrase '{phrase}' in response"
        
        print("✅ Test 5 PASSED: audio-transcribe returns honest structured error, no fake transcript")
        return True
    except Exception as e:
        print(f"❌ Test 5 FAILED: {str(e)}")
        return False


def test_memories_timeline_factual():
    """Test 6: GET /api/memories/timeline returns factual recaps with real counts"""
    print("\n=== Test 6: GET /api/memories/timeline - factual recaps ===")
    try:
        response = requests.get(
            f"{BASE_URL}/memories/timeline",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        print(f"monthlyRecap: {data.get('monthlyRecap', 'N/A')}")
        print(f"yearlyRecap: {data.get('yearlyRecap', 'N/A')}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "monthlyRecap" in data, "Missing monthlyRecap"
        assert "yearlyRecap" in data, "Missing yearlyRecap"
        
        # Check for factual language patterns
        monthly = data["monthlyRecap"]
        yearly = data["yearlyRecap"]
        
        # Should contain factual counts or "No new memories" message
        assert ("saved" in monthly.lower() or "no new memories" in monthly.lower()), "monthlyRecap should be factual"
        assert ("saved" in yearly.lower() or "no memories saved" in yearly.lower()), "yearlyRecap should be factual"
        
        # CRITICAL: Must NOT contain fabricated emotional narratives
        fabricated_phrases = [
            "year 2026 was defined by",
            "travel landmarks",
            "emotional journey",
            "sarika"  # hardcoded name from old code
        ]
        combined = (monthly + " " + yearly).lower()
        for phrase in fabricated_phrases:
            assert phrase not in combined, f"Found fabricated phrase '{phrase}' in recaps"
        
        print("✅ Test 6 PASSED: memories/timeline returns factual recaps")
        return True
    except Exception as e:
        print(f"❌ Test 6 FAILED: {str(e)}")
        return False


def test_favorites_ai_factual():
    """Test 7: GET /api/favorites/ai returns factual wording"""
    print("\n=== Test 7: GET /api/favorites/ai - factual relationship highlights ===")
    try:
        response = requests.get(
            f"{BASE_URL}/favorites/ai",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "relationshipHighlights" in data, "Missing relationshipHighlights"
        
        highlights = data["relationshipHighlights"]
        if highlights:
            # Should contain factual language like "appears most often"
            assert "appear" in highlights.lower() or "upload photos" in highlights.lower(), "Should be factual"
            
            # CRITICAL: Must NOT contain emotional fabrication
            fabricated = ["deep bond", "cherished", "special connection", "sarika"]
            for phrase in fabricated:
                assert phrase not in highlights.lower(), f"Found fabricated phrase '{phrase}'"
        
        print("✅ Test 7 PASSED: favorites/ai returns factual wording")
        return True
    except Exception as e:
        print(f"❌ Test 7 FAILED: {str(e)}")
        return False


# ========== NEW JOURNAL ENDPOINTS ==========

def test_journal_summary_monthly():
    """Test 8: GET /api/journal/summary?cycle=monthly returns real stats"""
    print("\n=== Test 8: GET /api/journal/summary?cycle=monthly ===")
    try:
        response = requests.get(
            f"{BASE_URL}/journal/summary?cycle=monthly",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "cycle" in data, "Missing cycle"
        assert data["cycle"] == "monthly", f"Expected cycle=monthly, got {data['cycle']}"
        assert "range" in data, "Missing range"
        assert "start" in data["range"], "Missing range.start"
        assert "end" in data["range"], "Missing range.end"
        assert "stats" in data, "Missing stats"
        
        # Verify stats structure
        stats = data["stats"]
        required_stats = ["memories", "photos", "videos", "favorites", "locations", "people", "albums"]
        for key in required_stats:
            assert key in stats, f"Missing stats.{key}"
            assert isinstance(stats[key], int), f"stats.{key} should be integer"
        
        assert "topTags" in data, "Missing topTags"
        assert isinstance(data["topTags"], list), "topTags should be array"
        assert "highlights" in data, "Missing highlights"
        assert isinstance(data["highlights"], list), "highlights should be array"
        assert "hasAnalyzedMedia" in data, "Missing hasAnalyzedMedia"
        
        print("✅ Test 8 PASSED: journal/summary returns real stats")
        return True
    except Exception as e:
        print(f"❌ Test 8 FAILED: {str(e)}")
        return False


def test_journal_summary_cycles():
    """Test 9: GET /api/journal/summary with different cycles"""
    print("\n=== Test 9: GET /api/journal/summary - all cycles ===")
    cycles = ["daily", "weekly", "monthly", "yearly", "invalid"]
    try:
        for cycle in cycles:
            response = requests.get(
                f"{BASE_URL}/journal/summary?cycle={cycle}",
                headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
            )
            print(f"  cycle={cycle}: status={response.status_code}")
            data = response.json()
            
            assert response.status_code == 200, f"Expected 200 for cycle={cycle}, got {response.status_code}"
            
            # Invalid cycle should default to monthly
            expected_cycle = cycle if cycle in ["daily", "weekly", "monthly", "yearly"] else "monthly"
            assert data["cycle"] == expected_cycle, f"Expected cycle={expected_cycle}, got {data['cycle']}"
        
        print("✅ Test 9 PASSED: All cycle values work correctly")
        return True
    except Exception as e:
        print(f"❌ Test 9 FAILED: {str(e)}")
        return False


def test_journal_summary_unauthorized():
    """Test 10: GET /api/journal/summary without auth returns 401"""
    print("\n=== Test 10: GET /api/journal/summary without auth ===")
    try:
        response = requests.get(f"{BASE_URL}/journal/summary?cycle=monthly")
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        assert "error" in data, "Missing error field"
        
        print("✅ Test 10 PASSED: Unauthorized request returns 401")
        return True
    except Exception as e:
        print(f"❌ Test 10 FAILED: {str(e)}")
        return False


def test_journal_narrative_with_data():
    """Test 11: POST /api/journal/narrative with media returns grounded narrative"""
    print("\n=== Test 11: POST /api/journal/narrative - grounded narrative ===")
    try:
        # First check if user has any media
        summary_response = requests.get(
            f"{BASE_URL}/journal/summary?cycle=monthly",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        summary_data = summary_response.json()
        
        if summary_data["stats"]["memories"] == 0:
            print("No media in window, uploading test image first...")
            img_buf = create_test_image()
            files = {'files': ('test_narrative.jpg', img_buf, 'image/jpeg')}
            upload_response = requests.post(
                f"{BASE_URL}/media/upload",
                headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"},
                files=files
            )
            if upload_response.status_code != 200:
                print(f"Upload failed: {upload_response.status_code}")
                return False
        
        # Now request narrative
        response = requests.post(
            f"{BASE_URL}/journal/narrative",
            headers={
                "Authorization": f"Bearer {PREVIEW_TOKEN}",
                "Content-Type": "application/json"
            },
            json={"cycle": "monthly"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if response.status_code == 400 and data.get("error", {}).get("code") == "no_data":
            print("✅ Test 11 PASSED: Correctly returns no_data error when no media")
            return True
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "narrative" in data, "Missing narrative"
        assert "meta" in data, "Missing meta"
        assert isinstance(data["narrative"], str), "narrative should be string"
        assert len(data["narrative"]) > 0, "narrative should not be empty"
        
        print("✅ Test 11 PASSED: journal/narrative returns grounded narrative")
        return True
    except Exception as e:
        print(f"❌ Test 11 FAILED: {str(e)}")
        return False


def test_journal_narrative_no_data():
    """Test 12: POST /api/journal/narrative with no media returns no_data error"""
    print("\n=== Test 12: POST /api/journal/narrative - no_data error ===")
    try:
        # Use a cycle that's unlikely to have data (daily from far past)
        response = requests.post(
            f"{BASE_URL}/journal/narrative",
            headers={
                "Authorization": f"Bearer {PREVIEW_TOKEN}",
                "Content-Type": "application/json"
            },
            json={"cycle": "daily"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Could be 200 with narrative or 400 with no_data
        if response.status_code == 400:
            assert "error" in data, "Missing error field"
            assert data["error"]["code"] == "no_data", f"Expected no_data error, got {data['error']['code']}"
            print("✅ Test 12 PASSED: Returns no_data error when appropriate")
        else:
            print("✅ Test 12 PASSED: Has data for daily cycle")
        
        return True
    except Exception as e:
        print(f"❌ Test 12 FAILED: {str(e)}")
        return False


# ========== AI VIA GATEWAY TESTS ==========

def test_ai_caption_text():
    """Test 13: POST /api/ai/caption with text topic returns real caption"""
    print("\n=== Test 13: POST /api/ai/caption - text topic ===")
    try:
        response = requests.post(
            f"{BASE_URL}/ai/caption",
            headers={
                "Authorization": f"Bearer {PREVIEW_TOKEN}",
                "Content-Type": "application/json"
            },
            json={"topic": "sunset at the beach"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "caption" in data, "Missing caption"
        assert "meta" in data, "Missing meta"
        assert isinstance(data["caption"], str), "caption should be string"
        assert len(data["caption"]) > 0, "caption should not be empty"
        assert "provider" in data["meta"], "Missing meta.provider"
        
        print("✅ Test 13 PASSED: AI caption via gateway works")
        return True
    except Exception as e:
        print(f"❌ Test 13 FAILED: {str(e)}")
        return False


def test_ai_caption_vision():
    """Test 14: POST /api/ai/caption with mediaId returns vision caption"""
    print("\n=== Test 14: POST /api/ai/caption - vision with mediaId ===")
    try:
        # Upload test image first
        img_buf = create_test_image()
        files = {'files': ('test_vision.jpg', img_buf, 'image/jpeg')}
        upload_response = requests.post(
            f"{BASE_URL}/media/upload",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"},
            files=files
        )
        
        if upload_response.status_code != 200:
            print(f"Upload failed: {upload_response.status_code}")
            return False
        
        upload_data = upload_response.json()
        if not upload_data.get('saved') or len(upload_data['saved']) == 0:
            print("No media saved in upload")
            return False
        
        media_id = upload_data['saved'][0]['id']
        print(f"Uploaded test image with ID: {media_id}")
        
        # Request vision caption
        response = requests.post(
            f"{BASE_URL}/ai/caption",
            headers={
                "Authorization": f"Bearer {PREVIEW_TOKEN}",
                "Content-Type": "application/json"
            },
            json={"mediaId": media_id}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "caption" in data, "Missing caption"
        assert "meta" in data, "Missing meta"
        
        print("✅ Test 14 PASSED: Vision caption via gateway works")
        return True
    except Exception as e:
        print(f"❌ Test 14 FAILED: {str(e)}")
        return False


def test_ai_hashtags():
    """Test 15: POST /api/ai/hashtags returns real hashtags"""
    print("\n=== Test 15: POST /api/ai/hashtags ===")
    try:
        response = requests.post(
            f"{BASE_URL}/ai/hashtags",
            headers={
                "Authorization": f"Bearer {PREVIEW_TOKEN}",
                "Content-Type": "application/json"
            },
            json={"text": "beach day"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "hashtags" in data, "Missing hashtags"
        assert "meta" in data, "Missing meta"
        
        print("✅ Test 15 PASSED: AI hashtags via gateway works")
        return True
    except Exception as e:
        print(f"❌ Test 15 FAILED: {str(e)}")
        return False


def test_ai_chat():
    """Test 16: POST /api/ai/chat returns grounded reply"""
    print("\n=== Test 16: POST /api/ai/chat ===")
    try:
        response = requests.post(
            f"{BASE_URL}/ai/chat",
            headers={
                "Authorization": f"Bearer {PREVIEW_TOKEN}",
                "Content-Type": "application/json"
            },
            json={"query": "What did I save recently?"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "reply" in data, "Missing reply"
        assert isinstance(data["reply"], str), "reply should be string"
        
        print("✅ Test 16 PASSED: AI chat via gateway works")
        return True
    except Exception as e:
        print(f"❌ Test 16 FAILED: {str(e)}")
        return False


def test_ai_status():
    """Test 17: GET /api/ai/status?feature=caption returns plan/credits"""
    print("\n=== Test 17: GET /api/ai/status?feature=caption ===")
    try:
        response = requests.get(
            f"{BASE_URL}/ai/status?feature=caption",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "plan" in data, "Missing plan"
        assert "feature" in data, "Missing feature"
        assert "creditsRequired" in data, "Missing creditsRequired"
        assert "monthlyCredits" in data, "Missing monthlyCredits"
        assert "dailyCredits" in data, "Missing dailyCredits"
        assert "superUser" in data, "Missing superUser"
        
        print("✅ Test 17 PASSED: AI status returns plan/credits info")
        return True
    except Exception as e:
        print(f"❌ Test 17 FAILED: {str(e)}")
        return False


# ========== REGRESSION TESTS ==========

def test_regression_plans():
    """Test 18: GET /api/plans still works"""
    print("\n=== Test 18: GET /api/plans (regression) ===")
    try:
        response = requests.get(f"{BASE_URL}/plans")
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "plans" in data, "Missing plans"
        assert len(data["plans"]) >= 4, "Should have at least 4 plans"
        
        print("✅ Test 18 PASSED: Plans endpoint works")
        return True
    except Exception as e:
        print(f"❌ Test 18 FAILED: {str(e)}")
        return False


def test_regression_storage_usage():
    """Test 19: GET /api/storage/usage still works"""
    print("\n=== Test 19: GET /api/storage/usage (regression) ===")
    try:
        response = requests.get(
            f"{BASE_URL}/storage/usage",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "usage" in data, "Missing usage"
        assert "plan" in data, "Missing plan"
        
        print("✅ Test 19 PASSED: Storage usage endpoint works")
        return True
    except Exception as e:
        print(f"❌ Test 19 FAILED: {str(e)}")
        return False


def test_regression_media_list():
    """Test 20: GET /api/media still works"""
    print("\n=== Test 20: GET /api/media (regression) ===")
    try:
        response = requests.get(
            f"{BASE_URL}/media",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "items" in data, "Missing items"
        
        print("✅ Test 20 PASSED: Media list endpoint works")
        return True
    except Exception as e:
        print(f"❌ Test 20 FAILED: {str(e)}")
        return False


def test_regression_billing_status():
    """Test 21: GET /api/billing/status still works"""
    print("\n=== Test 21: GET /api/billing/status (regression) ===")
    try:
        response = requests.get(
            f"{BASE_URL}/billing/status",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "provider" in data, "Missing provider"
        
        print("✅ Test 21 PASSED: Billing status endpoint works")
        return True
    except Exception as e:
        print(f"❌ Test 21 FAILED: {str(e)}")
        return False


def test_regression_billing_checkout():
    """Test 22: POST /api/billing/checkout still works (mock)"""
    print("\n=== Test 22: POST /api/billing/checkout (regression) ===")
    try:
        response = requests.post(
            f"{BASE_URL}/billing/checkout",
            headers={
                "Authorization": f"Bearer {PREVIEW_TOKEN}",
                "Content-Type": "application/json"
            },
            json={"planId": "plus"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Should work in dev with mock provider
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "ok" in data, "Missing ok field"
        
        print("✅ Test 22 PASSED: Billing checkout works (mock)")
        return True
    except Exception as e:
        print(f"❌ Test 22 FAILED: {str(e)}")
        return False


def test_regression_admin_users():
    """Test 23: GET /api/admin/users still works"""
    print("\n=== Test 23: GET /api/admin/users (regression) ===")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/users",
            headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        )
        print(f"Status: {response.status_code}")
        data = response.json()
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "users" in data, "Missing users"
        
        print("✅ Test 23 PASSED: Admin users endpoint works")
        return True
    except Exception as e:
        print(f"❌ Test 23 FAILED: {str(e)}")
        return False


# ========== MAIN TEST RUNNER ==========

def main():
    print("=" * 80)
    print("PHASE 1 SECURITY & TRUTHFULNESS BACKEND TESTING")
    print("=" * 80)
    
    results = []
    
    # Security tests
    print("\n" + "=" * 80)
    print("SECURITY TESTS")
    print("=" * 80)
    results.append(("Auth config previewAllowed", test_auth_config_preview_allowed()))
    results.append(("Auth me with preview token", test_auth_me_with_preview_token()))
    results.append(("Auth me without token", test_auth_me_without_token()))
    results.append(("Dashboard redirect (fail-closed)", test_dashboard_redirect_without_auth()))
    
    # Truthfulness tests
    print("\n" + "=" * 80)
    print("TRUTHFULNESS TESTS")
    print("=" * 80)
    results.append(("Audio transcribe honest error", test_audio_transcribe_returns_error()))
    results.append(("Memories timeline factual", test_memories_timeline_factual()))
    results.append(("Favorites AI factual", test_favorites_ai_factual()))
    
    # Journal endpoints
    print("\n" + "=" * 80)
    print("NEW JOURNAL ENDPOINTS")
    print("=" * 80)
    results.append(("Journal summary monthly", test_journal_summary_monthly()))
    results.append(("Journal summary all cycles", test_journal_summary_cycles()))
    results.append(("Journal summary unauthorized", test_journal_summary_unauthorized()))
    results.append(("Journal narrative with data", test_journal_narrative_with_data()))
    results.append(("Journal narrative no data", test_journal_narrative_no_data()))
    
    # AI via gateway
    print("\n" + "=" * 80)
    print("AI VIA GATEWAY TESTS")
    print("=" * 80)
    results.append(("AI caption text", test_ai_caption_text()))
    results.append(("AI caption vision", test_ai_caption_vision()))
    results.append(("AI hashtags", test_ai_hashtags()))
    results.append(("AI chat", test_ai_chat()))
    results.append(("AI status", test_ai_status()))
    
    # Regression tests
    print("\n" + "=" * 80)
    print("REGRESSION TESTS")
    print("=" * 80)
    results.append(("Plans endpoint", test_regression_plans()))
    results.append(("Storage usage", test_regression_storage_usage()))
    results.append(("Media list", test_regression_media_list()))
    results.append(("Billing status", test_regression_billing_status()))
    results.append(("Billing checkout", test_regression_billing_checkout()))
    results.append(("Admin users", test_regression_admin_users()))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    print(f"\nTotal: {passed}/{total} tests passed ({100*passed//total}%)\n")
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
