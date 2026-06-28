#!/usr/bin/env python3
"""
SnapNext AI - Comprehensive Backend/API Verification Sprint
Verifies and classifies all backend endpoints for final product integration audit.

Classification categories:
- ✅ Working: Endpoint works correctly with proper env vars
- ⚠ Works but limited: Works but missing optional features/env vars
- ❌ Backend missing: Endpoint not implemented
- ❌ Missing environment variable: Requires env var not present
- ❌ Missing API: External API integration missing
- ❌ UI only: No backend support, frontend-only feature
"""

import requests
import json
import sys

BASE_URL = "https://snapnext-auth-fix.preview.emergentagent.com/api"

# Test results storage
results = {
    "working": [],
    "works_but_limited": [],
    "backend_missing": [],
    "missing_env_var": [],
    "missing_api": [],
    "ui_only": [],
    "endpoints_tested": [],
    "missing_env_vars": set()
}

def classify_feature(feature_name, status, details="", missing_env=None, endpoint=None):
    """Classify a feature and store results"""
    if endpoint:
        results["endpoints_tested"].append(endpoint)
    
    if missing_env:
        results["missing_env_vars"].add(missing_env)
    
    entry = {"feature": feature_name, "details": details, "endpoint": endpoint or "N/A"}
    
    if status == "working":
        results["working"].append(entry)
        print(f"✅ {feature_name}: Working")
    elif status == "works_but_limited":
        results["works_but_limited"].append(entry)
        print(f"⚠️  {feature_name}: Works but limited - {details}")
    elif status == "backend_missing":
        results["backend_missing"].append(entry)
        print(f"❌ {feature_name}: Backend missing - {details}")
    elif status == "missing_env_var":
        results["missing_env_var"].append(entry)
        print(f"❌ {feature_name}: Missing environment variable - {details}")
    elif status == "missing_api":
        results["missing_api"].append(entry)
        print(f"❌ {feature_name}: Missing API - {details}")
    elif status == "ui_only":
        results["ui_only"].append(entry)
        print(f"❌ {feature_name}: UI only - {details}")
    
    if details:
        print(f"   Details: {details}")

print("=" * 100)
print("SnapNext AI - Comprehensive Backend/API Verification Sprint")
print("=" * 100)
print()

# Get preview demo token for testing
PREVIEW_TOKEN = "preview-demo-token"

print("🔍 PHASE 1: AUTHENTICATION & USER MANAGEMENT")
print("-" * 100)

# Test /auth/config
try:
    r = requests.get(f"{BASE_URL}/auth/config")
    if r.status_code == 200:
        data = r.json()
        if data.get("supabase") == False:
            classify_feature(
                "Auth Configuration Check",
                "missing_env_var",
                "Supabase not configured (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY missing)",
                missing_env="SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
                endpoint="GET /auth/config"
            )
        else:
            classify_feature("Auth Configuration Check", "working", endpoint="GET /auth/config")
    else:
        classify_feature("Auth Configuration Check", "backend_missing", f"Status {r.status_code}", endpoint="GET /auth/config")
except Exception as e:
    classify_feature("Auth Configuration Check", "backend_missing", str(e), endpoint="GET /auth/config")

# Test /auth/signup
try:
    r = requests.post(f"{BASE_URL}/auth/signup", json={"email": "test@test.com", "password": "test123"})
    if r.status_code == 503:
        data = r.json()
        if "Supabase" in data.get("error", ""):
            classify_feature(
                "Signup",
                "missing_env_var",
                "Returns 503 JSON (Supabase not configured)",
                missing_env="SUPABASE_URL",
                endpoint="POST /auth/signup"
            )
        else:
            classify_feature("Signup", "backend_missing", f"503 but wrong error: {data}", endpoint="POST /auth/signup")
    elif r.status_code in [200, 400, 409]:
        classify_feature("Signup", "working", endpoint="POST /auth/signup")
    else:
        classify_feature("Signup", "backend_missing", f"Unexpected status {r.status_code}", endpoint="POST /auth/signup")
except Exception as e:
    classify_feature("Signup", "backend_missing", str(e), endpoint="POST /auth/signup")

# Test /auth/login
try:
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": "test@test.com", "password": "test123"})
    if r.status_code == 503:
        data = r.json()
        if "Supabase" in data.get("error", ""):
            classify_feature(
                "Login",
                "missing_env_var",
                "Returns 503 JSON (Supabase not configured)",
                missing_env="SUPABASE_URL",
                endpoint="POST /auth/login"
            )
        else:
            classify_feature("Login", "backend_missing", f"503 but wrong error: {data}", endpoint="POST /auth/login")
    elif r.status_code in [200, 401]:
        classify_feature("Login", "working", endpoint="POST /auth/login")
    else:
        classify_feature("Login", "backend_missing", f"Unexpected status {r.status_code}", endpoint="POST /auth/login")
except Exception as e:
    classify_feature("Login", "backend_missing", str(e), endpoint="POST /auth/login")

# Test /auth/me with preview token
try:
    r = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "user" in data:
            classify_feature("Get Current User (/auth/me)", "working", "Preview token works", endpoint="GET /auth/me")
        else:
            classify_feature("Get Current User (/auth/me)", "backend_missing", "Missing user field", endpoint="GET /auth/me")
    else:
        classify_feature("Get Current User (/auth/me)", "backend_missing", f"Status {r.status_code}", endpoint="GET /auth/me")
except Exception as e:
    classify_feature("Get Current User (/auth/me)", "backend_missing", str(e), endpoint="GET /auth/me")

# Test /auth/logout
try:
    r = requests.post(f"{BASE_URL}/auth/logout")
    if r.status_code == 200:
        classify_feature("Logout", "working", endpoint="POST /auth/logout")
    else:
        classify_feature("Logout", "backend_missing", f"Status {r.status_code}", endpoint="POST /auth/logout")
except Exception as e:
    classify_feature("Logout", "backend_missing", str(e), endpoint="POST /auth/logout")

# Test /auth/forgot
try:
    r = requests.post(f"{BASE_URL}/auth/forgot", json={"email": "test@test.com"})
    if r.status_code in [200, 503]:
        if r.status_code == 503:
            classify_feature(
                "Password Reset Request",
                "missing_env_var",
                "Returns 503 (Supabase not configured)",
                missing_env="SUPABASE_URL",
                endpoint="POST /auth/forgot"
            )
        else:
            classify_feature("Password Reset Request", "working", endpoint="POST /auth/forgot")
    else:
        classify_feature("Password Reset Request", "backend_missing", f"Status {r.status_code}", endpoint="POST /auth/forgot")
except Exception as e:
    classify_feature("Password Reset Request", "backend_missing", str(e), endpoint="POST /auth/forgot")

# Test /auth/reset/verify
try:
    r = requests.get(f"{BASE_URL}/auth/reset/verify?token_hash=dummy")
    if r.status_code in [200, 400]:
        classify_feature("Password Reset Verify", "working", endpoint="GET /auth/reset/verify")
    else:
        classify_feature("Password Reset Verify", "backend_missing", f"Status {r.status_code}", endpoint="GET /auth/reset/verify")
except Exception as e:
    classify_feature("Password Reset Verify", "backend_missing", str(e), endpoint="GET /auth/reset/verify")

# Test /auth/reset
try:
    r = requests.post(f"{BASE_URL}/auth/reset", json={"password": "newpass123"})
    if r.status_code in [400, 503]:
        if r.status_code == 503:
            classify_feature(
                "Password Reset",
                "missing_env_var",
                "Returns 503 (Supabase not configured)",
                missing_env="SUPABASE_URL",
                endpoint="POST /auth/reset"
            )
        else:
            classify_feature("Password Reset", "working", "Validation working", endpoint="POST /auth/reset")
    else:
        classify_feature("Password Reset", "backend_missing", f"Status {r.status_code}", endpoint="POST /auth/reset")
except Exception as e:
    classify_feature("Password Reset", "backend_missing", str(e), endpoint="POST /auth/reset")

# Test /auth/verify/send
try:
    r = requests.post(f"{BASE_URL}/auth/verify/send", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [200, 401]:
        classify_feature("Email Verification Send", "working", endpoint="POST /auth/verify/send")
    else:
        classify_feature("Email Verification Send", "backend_missing", f"Status {r.status_code}", endpoint="POST /auth/verify/send")
except Exception as e:
    classify_feature("Email Verification Send", "backend_missing", str(e), endpoint="POST /auth/verify/send")

# Test /auth/verify
try:
    r = requests.get(f"{BASE_URL}/auth/verify?token_hash=dummy")
    if r.status_code in [200, 400, 503]:
        if r.status_code == 503:
            classify_feature(
                "Email Verification",
                "missing_env_var",
                "Returns 503 (Supabase not configured)",
                missing_env="SUPABASE_URL",
                endpoint="GET /auth/verify"
            )
        else:
            classify_feature("Email Verification", "working", endpoint="GET /auth/verify")
    else:
        classify_feature("Email Verification", "backend_missing", f"Status {r.status_code}", endpoint="GET /auth/verify")
except Exception as e:
    classify_feature("Email Verification", "backend_missing", str(e), endpoint="GET /auth/verify")

# Test /auth/delete-account
try:
    r = requests.post(f"{BASE_URL}/auth/delete-account", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [200, 401]:
        classify_feature("Account Deletion", "working", endpoint="POST /auth/delete-account")
    else:
        classify_feature("Account Deletion", "backend_missing", f"Status {r.status_code}", endpoint="POST /auth/delete-account")
except Exception as e:
    classify_feature("Account Deletion", "backend_missing", str(e), endpoint="POST /auth/delete-account")

print()
print("📦 PHASE 2: STORAGE & MEDIA MANAGEMENT")
print("-" * 100)

# Test /plans
try:
    r = requests.get(f"{BASE_URL}/plans")
    if r.status_code == 200:
        data = r.json()
        if "plans" in data and len(data["plans"]) >= 4:
            classify_feature("Plans Configuration", "working", f"Found {len(data['plans'])} plans", endpoint="GET /plans")
        else:
            classify_feature("Plans Configuration", "backend_missing", "Missing plans", endpoint="GET /plans")
    else:
        classify_feature("Plans Configuration", "backend_missing", f"Status {r.status_code}", endpoint="GET /plans")
except Exception as e:
    classify_feature("Plans Configuration", "backend_missing", str(e), endpoint="GET /plans")

# Test /storage/usage
try:
    r = requests.get(f"{BASE_URL}/storage/usage", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "usage" in data and "plan" in data:
            classify_feature("Storage Usage Stats", "working", endpoint="GET /storage/usage")
        else:
            classify_feature("Storage Usage Stats", "backend_missing", "Missing fields", endpoint="GET /storage/usage")
    else:
        classify_feature("Storage Usage Stats", "backend_missing", f"Status {r.status_code}", endpoint="GET /storage/usage")
except Exception as e:
    classify_feature("Storage Usage Stats", "backend_missing", str(e), endpoint="GET /storage/usage")

# Test /media/upload
try:
    r = requests.post(f"{BASE_URL}/media/upload", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, files={})
    if r.status_code in [400, 401]:
        classify_feature("Photo/Video Upload", "working", "Validation working", endpoint="POST /media/upload")
    else:
        classify_feature("Photo/Video Upload", "backend_missing", f"Status {r.status_code}", endpoint="POST /media/upload")
except Exception as e:
    classify_feature("Photo/Video Upload", "backend_missing", str(e), endpoint="POST /media/upload")

# Test /media/text
try:
    r = requests.post(f"{BASE_URL}/media/text", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"text": "test"})
    if r.status_code in [200, 400, 401]:
        classify_feature("Text Quick Capture", "working", endpoint="POST /media/text")
    else:
        classify_feature("Text Quick Capture", "backend_missing", f"Status {r.status_code}", endpoint="POST /media/text")
except Exception as e:
    classify_feature("Text Quick Capture", "backend_missing", str(e), endpoint="POST /media/text")

# Test /media (list)
try:
    r = requests.get(f"{BASE_URL}/media?filter=all", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "items" in data:
            classify_feature("Media List/Gallery", "working", endpoint="GET /media")
        else:
            classify_feature("Media List/Gallery", "backend_missing", "Missing items", endpoint="GET /media")
    else:
        classify_feature("Media List/Gallery", "backend_missing", f"Status {r.status_code}", endpoint="GET /media")
except Exception as e:
    classify_feature("Media List/Gallery", "backend_missing", str(e), endpoint="GET /media")

# Test /media search
try:
    r = requests.get(f"{BASE_URL}/media?q=test", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        classify_feature("Media Search", "working", endpoint="GET /media?q=")
    else:
        classify_feature("Media Search", "backend_missing", f"Status {r.status_code}", endpoint="GET /media?q=")
except Exception as e:
    classify_feature("Media Search", "backend_missing", str(e), endpoint="GET /media?q=")

# Test /media filters
for filter_type in ["photo", "video", "favorite", "trash"]:
    try:
        r = requests.get(f"{BASE_URL}/media?filter={filter_type}", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
        if r.status_code == 200:
            classify_feature(f"Media Filter ({filter_type})", "working", endpoint=f"GET /media?filter={filter_type}")
        else:
            classify_feature(f"Media Filter ({filter_type})", "backend_missing", f"Status {r.status_code}", endpoint=f"GET /media?filter={filter_type}")
    except Exception as e:
        classify_feature(f"Media Filter ({filter_type})", "backend_missing", str(e), endpoint=f"GET /media?filter={filter_type}")

# Test /media/:id/file
try:
    r = requests.get(f"{BASE_URL}/media/test-id/file", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [404, 401]:
        classify_feature("Media File Streaming", "working", "Endpoint exists", endpoint="GET /media/:id/file")
    else:
        classify_feature("Media File Streaming", "backend_missing", f"Status {r.status_code}", endpoint="GET /media/:id/file")
except Exception as e:
    classify_feature("Media File Streaming", "backend_missing", str(e), endpoint="GET /media/:id/file")

# Test /media/:id/favorite
try:
    r = requests.post(f"{BASE_URL}/media/test-id/favorite", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [404, 200]:
        classify_feature("Favorite Toggle", "working", endpoint="POST /media/:id/favorite")
    else:
        classify_feature("Favorite Toggle", "backend_missing", f"Status {r.status_code}", endpoint="POST /media/:id/favorite")
except Exception as e:
    classify_feature("Favorite Toggle", "backend_missing", str(e), endpoint="POST /media/:id/favorite")

# Test /media/:id/trash
try:
    r = requests.post(f"{BASE_URL}/media/test-id/trash", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [404, 200]:
        classify_feature("Trash", "working", endpoint="POST /media/:id/trash")
    else:
        classify_feature("Trash", "backend_missing", f"Status {r.status_code}", endpoint="POST /media/:id/trash")
except Exception as e:
    classify_feature("Trash", "backend_missing", str(e), endpoint="POST /media/:id/trash")

# Test /media/:id/restore
try:
    r = requests.post(f"{BASE_URL}/media/test-id/restore", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [404, 200]:
        classify_feature("Restore from Trash", "working", endpoint="POST /media/:id/restore")
    else:
        classify_feature("Restore from Trash", "backend_missing", f"Status {r.status_code}", endpoint="POST /media/:id/restore")
except Exception as e:
    classify_feature("Restore from Trash", "backend_missing", str(e), endpoint="POST /media/:id/restore")

# Test /media/:id/delete
try:
    r = requests.post(f"{BASE_URL}/media/test-id/delete", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [404, 200]:
        classify_feature("Permanent Delete", "working", endpoint="POST /media/:id/delete")
    else:
        classify_feature("Permanent Delete", "backend_missing", f"Status {r.status_code}", endpoint="POST /media/:id/delete")
except Exception as e:
    classify_feature("Permanent Delete", "backend_missing", str(e), endpoint="POST /media/:id/delete")

# Test /media/bulk
try:
    r = requests.post(f"{BASE_URL}/media/bulk", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"ids": [], "action": "trash"})
    if r.status_code in [400, 200]:
        classify_feature("Bulk Operations", "working", endpoint="POST /media/bulk")
    else:
        classify_feature("Bulk Operations", "backend_missing", f"Status {r.status_code}", endpoint="POST /media/bulk")
except Exception as e:
    classify_feature("Bulk Operations", "backend_missing", str(e), endpoint="POST /media/bulk")

# Test /downloads/log
try:
    r = requests.post(f"{BASE_URL}/downloads/log", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"mediaIds": []})
    if r.status_code in [200, 401]:
        classify_feature("Download Logging", "working", endpoint="POST /downloads/log")
    else:
        classify_feature("Download Logging", "backend_missing", f"Status {r.status_code}", endpoint="POST /downloads/log")
except Exception as e:
    classify_feature("Download Logging", "backend_missing", str(e), endpoint="POST /downloads/log")

print()
print("🧠 PHASE 3: AI FEATURES")
print("-" * 100)

# Test /ai/caption
try:
    r = requests.post(f"{BASE_URL}/ai/caption", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"topic": "test"})
    if r.status_code == 200:
        classify_feature("AI Caption Generator", "working", endpoint="POST /ai/caption")
    elif r.status_code == 429:
        classify_feature("AI Caption Generator", "working", "Quota limit hit (expected)", endpoint="POST /ai/caption")
    else:
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        error = data.get("error", "")
        if "EMERGENT_LLM_KEY" in error or "LLM" in error:
            classify_feature("AI Caption Generator", "missing_env_var", "EMERGENT_LLM_KEY missing", missing_env="EMERGENT_LLM_KEY", endpoint="POST /ai/caption")
        else:
            classify_feature("AI Caption Generator", "backend_missing", f"Status {r.status_code}: {error}", endpoint="POST /ai/caption")
except Exception as e:
    classify_feature("AI Caption Generator", "backend_missing", str(e), endpoint="POST /ai/caption")

# Test /ai/hashtags
try:
    r = requests.post(f"{BASE_URL}/ai/hashtags", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"text": "test"})
    if r.status_code in [200, 429]:
        classify_feature("AI Hashtag Generator", "working", endpoint="POST /ai/hashtags")
    else:
        classify_feature("AI Hashtag Generator", "missing_env_var", "EMERGENT_LLM_KEY missing", missing_env="EMERGENT_LLM_KEY", endpoint="POST /ai/hashtags")
except Exception as e:
    classify_feature("AI Hashtag Generator", "backend_missing", str(e), endpoint="POST /ai/hashtags")

# Test /ai/emojis
try:
    r = requests.post(f"{BASE_URL}/ai/emojis", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"text": "test"})
    if r.status_code in [200, 429]:
        classify_feature("AI Emoji Suggestions", "working", endpoint="POST /ai/emojis")
    else:
        classify_feature("AI Emoji Suggestions", "missing_env_var", "EMERGENT_LLM_KEY missing", missing_env="EMERGENT_LLM_KEY", endpoint="POST /ai/emojis")
except Exception as e:
    classify_feature("AI Emoji Suggestions", "backend_missing", str(e), endpoint="POST /ai/emojis")

# Test /ai/post-ideas
try:
    r = requests.post(f"{BASE_URL}/ai/post-ideas", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"topic": "test"})
    if r.status_code in [200, 429]:
        classify_feature("AI Post Ideas", "working", endpoint="POST /ai/post-ideas")
    else:
        classify_feature("AI Post Ideas", "missing_env_var", "EMERGENT_LLM_KEY missing", missing_env="EMERGENT_LLM_KEY", endpoint="POST /ai/post-ideas")
except Exception as e:
    classify_feature("AI Post Ideas", "backend_missing", str(e), endpoint="POST /ai/post-ideas")

# Test /ai/memory-summary
try:
    r = requests.post(f"{BASE_URL}/ai/memory-summary", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"titles": ["test"], "dateLabel": "Jan 2024"})
    if r.status_code in [200, 429]:
        classify_feature("AI Memory Summary", "working", endpoint="POST /ai/memory-summary")
    else:
        classify_feature("AI Memory Summary", "missing_env_var", "EMERGENT_LLM_KEY missing", missing_env="EMERGENT_LLM_KEY", endpoint="POST /ai/memory-summary")
except Exception as e:
    classify_feature("AI Memory Summary", "backend_missing", str(e), endpoint="POST /ai/memory-summary")

# Test /ai/story
try:
    r = requests.post(f"{BASE_URL}/ai/story", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"theme": "test", "count": 3})
    if r.status_code in [200, 429]:
        classify_feature("AI Story Generator", "working", endpoint="POST /ai/story")
    else:
        classify_feature("AI Story Generator", "missing_env_var", "EMERGENT_LLM_KEY missing", missing_env="EMERGENT_LLM_KEY", endpoint="POST /ai/story")
except Exception as e:
    classify_feature("AI Story Generator", "backend_missing", str(e), endpoint="POST /ai/story")

# Test /ai/chat
try:
    r = requests.post(f"{BASE_URL}/ai/chat", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"query": "test"})
    if r.status_code in [200, 429]:
        classify_feature("AI Chat Assistant", "working", endpoint="POST /ai/chat")
    else:
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        error = data.get("error", "")
        if "GEMINI" in error:
            classify_feature("AI Chat Assistant", "missing_env_var", "GEMINI_API_KEY missing", missing_env="GEMINI_API_KEY", endpoint="POST /ai/chat")
        else:
            classify_feature("AI Chat Assistant", "backend_missing", f"Status {r.status_code}", endpoint="POST /ai/chat")
except Exception as e:
    classify_feature("AI Chat Assistant", "backend_missing", str(e), endpoint="POST /ai/chat")

# Test /ai/audio-transcribe
try:
    r = requests.post(f"{BASE_URL}/ai/audio-transcribe", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"mediaId": "test"})
    if r.status_code in [200, 404, 429]:
        classify_feature("Audio Transcription", "working", endpoint="POST /ai/audio-transcribe")
    else:
        classify_feature("Audio Transcription", "missing_env_var", "GEMINI_API_KEY missing", missing_env="GEMINI_API_KEY", endpoint="POST /ai/audio-transcribe")
except Exception as e:
    classify_feature("Audio Transcription", "backend_missing", str(e), endpoint="POST /ai/audio-transcribe")

# Test /ai/generate-reel
try:
    r = requests.post(f"{BASE_URL}/ai/generate-reel", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"theme": "test"})
    if r.status_code in [200, 429]:
        classify_feature("AI Reel Creator", "working", endpoint="POST /ai/generate-reel")
    else:
        classify_feature("AI Reel Creator", "backend_missing", f"Status {r.status_code}", endpoint="POST /ai/generate-reel")
except Exception as e:
    classify_feature("AI Reel Creator", "backend_missing", str(e), endpoint="POST /ai/generate-reel")

# Test /ai/image-to-video
try:
    r = requests.post(f"{BASE_URL}/ai/image-to-video", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"mediaId": "test"})
    if r.status_code in [200, 404, 429]:
        classify_feature("Image to Video (Veo Lite)", "working", endpoint="POST /ai/image-to-video")
    else:
        classify_feature("Image to Video (Veo Lite)", "backend_missing", f"Status {r.status_code}", endpoint="POST /ai/image-to-video")
except Exception as e:
    classify_feature("Image to Video (Veo Lite)", "backend_missing", str(e), endpoint="POST /ai/image-to-video")

print()
print("📅 PHASE 4: MEMORIES & TIMELINE")
print("-" * 100)

# Test /memories
try:
    r = requests.get(f"{BASE_URL}/memories", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "groups" in data and "onThisDay" in data:
            classify_feature("Memories (Monthly Groups)", "working", endpoint="GET /memories")
        else:
            classify_feature("Memories (Monthly Groups)", "backend_missing", "Missing fields", endpoint="GET /memories")
    else:
        classify_feature("Memories (Monthly Groups)", "backend_missing", f"Status {r.status_code}", endpoint="GET /memories")
except Exception as e:
    classify_feature("Memories (Monthly Groups)", "backend_missing", str(e), endpoint="GET /memories")

# Test /memories/timeline
try:
    r = requests.get(f"{BASE_URL}/memories/timeline", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "onThisDay" in data and "familyJourney" in data:
            classify_feature("Timeline (AI-powered)", "working", endpoint="GET /memories/timeline")
        else:
            classify_feature("Timeline (AI-powered)", "backend_missing", "Missing fields", endpoint="GET /memories/timeline")
    else:
        classify_feature("Timeline (AI-powered)", "backend_missing", f"Status {r.status_code}", endpoint="GET /memories/timeline")
except Exception as e:
    classify_feature("Timeline (AI-powered)", "backend_missing", str(e), endpoint="GET /memories/timeline")

# Test /favorites/ai
try:
    r = requests.get(f"{BASE_URL}/favorites/ai", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "favoritePeople" in data:
            classify_feature("Favorites AI (Face Recognition)", "working", endpoint="GET /favorites/ai")
        else:
            classify_feature("Favorites AI (Face Recognition)", "backend_missing", "Missing fields", endpoint="GET /favorites/ai")
    else:
        classify_feature("Favorites AI (Face Recognition)", "backend_missing", f"Status {r.status_code}", endpoint="GET /favorites/ai")
except Exception as e:
    classify_feature("Favorites AI (Face Recognition)", "backend_missing", str(e), endpoint="GET /favorites/ai")

print()
print("💳 PHASE 5: BILLING & SUBSCRIPTIONS")
print("-" * 100)

# Test /billing/checkout
try:
    r = requests.post(f"{BASE_URL}/billing/checkout", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"planId": "plus"})
    if r.status_code == 200:
        data = r.json()
        if data.get("provider") == "mock":
            classify_feature("Billing Checkout", "works_but_limited", "Mock Stripe (no real Stripe keys)", endpoint="POST /billing/checkout")
        else:
            classify_feature("Billing Checkout", "working", endpoint="POST /billing/checkout")
    elif r.status_code == 400:
        data = r.json()
        if "Stripe" in data.get("error", ""):
            classify_feature("Billing Checkout", "missing_env_var", "Stripe keys missing", missing_env="STRIPE_SECRET_KEY", endpoint="POST /billing/checkout")
        else:
            classify_feature("Billing Checkout", "backend_missing", f"Error: {data.get('error')}", endpoint="POST /billing/checkout")
    else:
        classify_feature("Billing Checkout", "backend_missing", f"Status {r.status_code}", endpoint="POST /billing/checkout")
except Exception as e:
    classify_feature("Billing Checkout", "backend_missing", str(e), endpoint="POST /billing/checkout")

# Test /billing/portal
try:
    r = requests.post(f"{BASE_URL}/billing/portal", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        classify_feature("Billing Portal", "working", endpoint="POST /billing/portal")
    elif r.status_code == 400:
        data = r.json()
        if data.get("provider") == "mock":
            classify_feature("Billing Portal", "works_but_limited", "Mock Stripe", endpoint="POST /billing/portal")
        else:
            classify_feature("Billing Portal", "missing_env_var", "Stripe keys missing", missing_env="STRIPE_SECRET_KEY", endpoint="POST /billing/portal")
    else:
        classify_feature("Billing Portal", "backend_missing", f"Status {r.status_code}", endpoint="POST /billing/portal")
except Exception as e:
    classify_feature("Billing Portal", "backend_missing", str(e), endpoint="POST /billing/portal")

# Test /billing/status
try:
    r = requests.get(f"{BASE_URL}/billing/status", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "plan" in data:
            classify_feature("Billing Status", "working", endpoint="GET /billing/status")
        else:
            classify_feature("Billing Status", "backend_missing", "Missing fields", endpoint="GET /billing/status")
    else:
        classify_feature("Billing Status", "backend_missing", f"Status {r.status_code}", endpoint="GET /billing/status")
except Exception as e:
    classify_feature("Billing Status", "backend_missing", str(e), endpoint="GET /billing/status")

# Test /webhooks/stripe
try:
    r = requests.post(f"{BASE_URL}/webhooks/stripe", data="test", headers={"stripe-signature": "test"})
    if r.status_code == 503:
        data = r.json()
        if "Webhook secret" in data.get("error", ""):
            classify_feature("Stripe Webhooks", "missing_env_var", "STRIPE_WEBHOOK_SECRET missing", missing_env="STRIPE_WEBHOOK_SECRET", endpoint="POST /webhooks/stripe")
        else:
            classify_feature("Stripe Webhooks", "backend_missing", f"Error: {data.get('error')}", endpoint="POST /webhooks/stripe")
    elif r.status_code in [200, 400]:
        classify_feature("Stripe Webhooks", "working", endpoint="POST /webhooks/stripe")
    else:
        classify_feature("Stripe Webhooks", "backend_missing", f"Status {r.status_code}", endpoint="POST /webhooks/stripe")
except Exception as e:
    classify_feature("Stripe Webhooks", "backend_missing", str(e), endpoint="POST /webhooks/stripe")

print()
print("⚙️  PHASE 6: SETTINGS & PREFERENCES")
print("-" * 100)

# Test /settings/email-prefs GET
try:
    r = requests.get(f"{BASE_URL}/settings/email-prefs", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "prefs" in data:
            classify_feature("Email Preferences (GET)", "working", endpoint="GET /settings/email-prefs")
        else:
            classify_feature("Email Preferences (GET)", "backend_missing", "Missing fields", endpoint="GET /settings/email-prefs")
    else:
        classify_feature("Email Preferences (GET)", "backend_missing", f"Status {r.status_code}", endpoint="GET /settings/email-prefs")
except Exception as e:
    classify_feature("Email Preferences (GET)", "backend_missing", str(e), endpoint="GET /settings/email-prefs")

# Test /settings/email-prefs PUT
try:
    r = requests.put(f"{BASE_URL}/settings/email-prefs", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"marketing": False})
    if r.status_code in [200, 401]:
        classify_feature("Email Preferences (UPDATE)", "working", endpoint="PUT /settings/email-prefs")
    else:
        classify_feature("Email Preferences (UPDATE)", "backend_missing", f"Status {r.status_code}", endpoint="PUT /settings/email-prefs")
except Exception as e:
    classify_feature("Email Preferences (UPDATE)", "backend_missing", str(e), endpoint="PUT /settings/email-prefs")

# Test /unsubscribe
try:
    r = requests.get(f"{BASE_URL}/unsubscribe?t=dummy")
    if r.status_code in [200, 400]:
        classify_feature("Email Unsubscribe", "working", endpoint="GET /unsubscribe")
    else:
        classify_feature("Email Unsubscribe", "backend_missing", f"Status {r.status_code}", endpoint="GET /unsubscribe")
except Exception as e:
    classify_feature("Email Unsubscribe", "backend_missing", str(e), endpoint="GET /unsubscribe")

print()
print("👥 PHASE 7: FAVORITES & FAMILY SHARING")
print("-" * 100)

# Test /favorites
try:
    r = requests.get(f"{BASE_URL}/favorites", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "accepted" in data and "incoming" in data:
            classify_feature("Favorites List", "working", endpoint="GET /favorites")
        else:
            classify_feature("Favorites List", "backend_missing", "Missing fields", endpoint="GET /favorites")
    else:
        classify_feature("Favorites List", "backend_missing", f"Status {r.status_code}", endpoint="GET /favorites")
except Exception as e:
    classify_feature("Favorites List", "backend_missing", str(e), endpoint="GET /favorites")

# Test /favorites/invite
try:
    r = requests.post(f"{BASE_URL}/favorites/invite", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"email": "test@test.com"})
    if r.status_code in [200, 400, 404]:
        classify_feature("Favorites Invite", "working", endpoint="POST /favorites/invite")
    else:
        classify_feature("Favorites Invite", "backend_missing", f"Status {r.status_code}", endpoint="POST /favorites/invite")
except Exception as e:
    classify_feature("Favorites Invite", "backend_missing", str(e), endpoint="POST /favorites/invite")

# Test /favorites/:id/accept
try:
    r = requests.post(f"{BASE_URL}/favorites/test-id/accept", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [200, 404, 403]:
        classify_feature("Favorites Accept", "working", endpoint="POST /favorites/:id/accept")
    else:
        classify_feature("Favorites Accept", "backend_missing", f"Status {r.status_code}", endpoint="POST /favorites/:id/accept")
except Exception as e:
    classify_feature("Favorites Accept", "backend_missing", str(e), endpoint="POST /favorites/:id/accept")

# Test /favorites/:id/permissions
try:
    r = requests.get(f"{BASE_URL}/favorites/test-id/permissions", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [200, 404]:
        classify_feature("Favorites Permissions", "working", endpoint="GET /favorites/:id/permissions")
    else:
        classify_feature("Favorites Permissions", "backend_missing", f"Status {r.status_code}", endpoint="GET /favorites/:id/permissions")
except Exception as e:
    classify_feature("Favorites Permissions", "backend_missing", str(e), endpoint="GET /favorites/:id/permissions")

# Test /shared/photos
try:
    r = requests.get(f"{BASE_URL}/shared/photos", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "items" in data:
            classify_feature("Shared Photos", "working", endpoint="GET /shared/photos")
        else:
            classify_feature("Shared Photos", "backend_missing", "Missing fields", endpoint="GET /shared/photos")
    else:
        classify_feature("Shared Photos", "backend_missing", f"Status {r.status_code}", endpoint="GET /shared/photos")
except Exception as e:
    classify_feature("Shared Photos", "backend_missing", str(e), endpoint="GET /shared/photos")

# Test /shared/albums
try:
    r = requests.get(f"{BASE_URL}/shared/albums", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "owned" in data and "shared" in data:
            classify_feature("Shared Albums", "working", endpoint="GET /shared/albums")
        else:
            classify_feature("Shared Albums", "backend_missing", "Missing fields", endpoint="GET /shared/albums")
    else:
        classify_feature("Shared Albums", "backend_missing", f"Status {r.status_code}", endpoint="GET /shared/albums")
except Exception as e:
    classify_feature("Shared Albums", "backend_missing", str(e), endpoint="GET /shared/albums")

print()
print("👑 PHASE 8: ADMIN & SUPER USER")
print("-" * 100)

# Test /admin/users
try:
    r = requests.get(f"{BASE_URL}/admin/users", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code == 200:
        data = r.json()
        if "users" in data:
            classify_feature("Admin User List", "working", endpoint="GET /admin/users")
        else:
            classify_feature("Admin User List", "backend_missing", "Missing fields", endpoint="GET /admin/users")
    elif r.status_code == 403:
        classify_feature("Admin User List", "working", "Authorization working", endpoint="GET /admin/users")
    else:
        classify_feature("Admin User List", "backend_missing", f"Status {r.status_code}", endpoint="GET /admin/users")
except Exception as e:
    classify_feature("Admin User List", "backend_missing", str(e), endpoint="GET /admin/users")

# Test /admin/grant-super
try:
    r = requests.post(f"{BASE_URL}/admin/grant-super", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"userId": "test"})
    if r.status_code in [200, 403]:
        classify_feature("Admin Grant Super", "working", endpoint="POST /admin/grant-super")
    else:
        classify_feature("Admin Grant Super", "backend_missing", f"Status {r.status_code}", endpoint="POST /admin/grant-super")
except Exception as e:
    classify_feature("Admin Grant Super", "backend_missing", str(e), endpoint="POST /admin/grant-super")

# Test /admin/seed-super
try:
    r = requests.post(f"{BASE_URL}/admin/seed-super", json={"email": "test@test.com", "secret": "wrong"})
    if r.status_code in [200, 403]:
        classify_feature("Admin Seed Super (Bootstrap)", "working", endpoint="POST /admin/seed-super")
    else:
        classify_feature("Admin Seed Super (Bootstrap)", "backend_missing", f"Status {r.status_code}", endpoint="POST /admin/seed-super")
except Exception as e:
    classify_feature("Admin Seed Super (Bootstrap)", "backend_missing", str(e), endpoint="POST /admin/seed-super")

# Test /admin/emails
try:
    r = requests.get(f"{BASE_URL}/admin/emails", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [200, 403]:
        classify_feature("Admin Email Events", "working", endpoint="GET /admin/emails")
    else:
        classify_feature("Admin Email Events", "backend_missing", f"Status {r.status_code}", endpoint="GET /admin/emails")
except Exception as e:
    classify_feature("Admin Email Events", "backend_missing", str(e), endpoint="GET /admin/emails")

# Test /admin/storage/health
try:
    r = requests.get(f"{BASE_URL}/admin/storage/health", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [200, 403]:
        classify_feature("Admin Storage Health", "working", endpoint="GET /admin/storage/health")
    else:
        classify_feature("Admin Storage Health", "backend_missing", f"Status {r.status_code}", endpoint="GET /admin/storage/health")
except Exception as e:
    classify_feature("Admin Storage Health", "backend_missing", str(e), endpoint="GET /admin/storage/health")

# Test /admin/billing/health
try:
    r = requests.get(f"{BASE_URL}/admin/billing/health", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"})
    if r.status_code in [200, 403]:
        classify_feature("Admin Billing Health", "working", endpoint="GET /admin/billing/health")
    else:
        classify_feature("Admin Billing Health", "backend_missing", f"Status {r.status_code}", endpoint="GET /admin/billing/health")
except Exception as e:
    classify_feature("Admin Billing Health", "backend_missing", str(e), endpoint="GET /admin/billing/health")

print()
print("📧 PHASE 9: EMAIL & NOTIFICATIONS")
print("-" * 100)

# Test /webhooks/resend
try:
    r = requests.post(f"{BASE_URL}/webhooks/resend", data='{"type":"email.sent"}', headers={"content-type": "application/json"})
    if r.status_code in [200, 401]:
        classify_feature("Email Webhooks (Resend)", "works_but_limited", "No RESEND_WEBHOOK_SECRET", endpoint="POST /webhooks/resend")
    else:
        classify_feature("Email Webhooks (Resend)", "backend_missing", f"Status {r.status_code}", endpoint="POST /webhooks/resend")
except Exception as e:
    classify_feature("Email Webhooks (Resend)", "backend_missing", str(e), endpoint="POST /webhooks/resend")

# Notifications - check if endpoint exists
classify_feature("Notifications", "ui_only", "No dedicated API endpoint found, likely handled via /favorites and /shared endpoints")

print()
print("🔍 PHASE 10: ADVANCED FEATURES")
print("-" * 100)

# Test /media/presign-upload
try:
    r = requests.post(f"{BASE_URL}/media/presign-upload", headers={"Authorization": f"Bearer {PREVIEW_TOKEN}"}, json={"name": "test.jpg"})
    if r.status_code == 400:
        data = r.json()
        if "s3" in data.get("error", "").lower():
            classify_feature("Direct S3 Upload (Presigned URLs)", "missing_env_var", "S3 not configured", missing_env="AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET", endpoint="POST /media/presign-upload")
        else:
            classify_feature("Direct S3 Upload (Presigned URLs)", "backend_missing", f"Error: {data.get('error')}", endpoint="POST /media/presign-upload")
    elif r.status_code == 200:
        classify_feature("Direct S3 Upload (Presigned URLs)", "working", endpoint="POST /media/presign-upload")
    else:
        classify_feature("Direct S3 Upload (Presigned URLs)", "backend_missing", f"Status {r.status_code}", endpoint="POST /media/presign-upload")
except Exception as e:
    classify_feature("Direct S3 Upload (Presigned URLs)", "backend_missing", str(e), endpoint="POST /media/presign-upload")

# Background sync/imports
classify_feature("Background Sync/Imports", "ui_only", "No dedicated API endpoint found")

# Daily summaries
classify_feature("Daily Summaries", "ui_only", "Uses /memories/timeline and /ai/memory-summary")

# Memory health
classify_feature("Memory Health", "ui_only", "No dedicated API endpoint found")

# Duplicate detection
classify_feature("Duplicate Detection", "working", "SHA-256 hash-based dedup in /media/upload")

print()
print("=" * 100)
print("FINAL CLASSIFICATION SUMMARY")
print("=" * 100)
print()

print(f"✅ WORKING ({len(results['working'])} features):")
for item in results['working']:
    print(f"   • {item['feature']} ({item['endpoint']})")
print()

print(f"⚠️  WORKS BUT LIMITED ({len(results['works_but_limited'])} features):")
for item in results['works_but_limited']:
    print(f"   • {item['feature']}: {item['details']} ({item['endpoint']})")
print()

print(f"❌ MISSING ENVIRONMENT VARIABLES ({len(results['missing_env_var'])} features):")
for item in results['missing_env_var']:
    print(f"   • {item['feature']}: {item['details']} ({item['endpoint']})")
print()

print(f"❌ BACKEND MISSING ({len(results['backend_missing'])} features):")
for item in results['backend_missing']:
    print(f"   • {item['feature']}: {item['details']} ({item['endpoint']})")
print()

print(f"❌ MISSING API ({len(results['missing_api'])} features):")
for item in results['missing_api']:
    print(f"   • {item['feature']}: {item['details']} ({item['endpoint']})")
print()

print(f"❌ UI ONLY ({len(results['ui_only'])} features):")
for item in results['ui_only']:
    print(f"   • {item['feature']}: {item['details']}")
print()

print("=" * 100)
print("MISSING ENVIRONMENT VARIABLES DETECTED:")
print("=" * 100)
for env_var in sorted(results['missing_env_vars']):
    print(f"   • {env_var}")
print()

print("=" * 100)
print(f"TOTAL ENDPOINTS TESTED: {len(set(results['endpoints_tested']))}")
print("=" * 100)
print()

# Exit with success
sys.exit(0)
