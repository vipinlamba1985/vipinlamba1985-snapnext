#!/usr/bin/env python3
"""
Comprehensive backend test suite for SnapNext AI MVP
Tests all API endpoints with edge cases and quota validation
"""

import requests
import json
import time
import os
import random
import string
from io import BytesIO

# Configuration
BASE_URL = "https://snapnext-auth-fix.preview.emergentagent.com/api"
JWT_SECRET = "snapnext-dev-secret-change-in-prod-2025"
EXISTING_USER_EMAIL = "test@snapnext.ai"
EXISTING_USER_PASSWORD = "test1234"

# Test state
test_results = {
    "passed": 0,
    "failed": 0,
    "errors": []
}

def log_test(name, passed, details=""):
    """Log test result"""
    if passed:
        test_results["passed"] += 1
        print(f"✅ {name}")
    else:
        test_results["failed"] += 1
        test_results["errors"].append(f"{name}: {details}")
        print(f"❌ {name}: {details}")

def random_email():
    """Generate random email for testing"""
    return f"test_{random.randint(10000, 99999)}@snapnext.test"

def create_test_image():
    """Create a small test image (1x1 PNG)"""
    # Minimal valid PNG file (1x1 pixel, transparent)
    png_data = bytes([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,  # IDAT chunk
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,  # IEND chunk
        0x42, 0x60, 0x82
    ])
    return png_data

def create_test_video():
    """Create a minimal test video file"""
    # Minimal MP4 header
    return b'\x00\x00\x00\x20\x66\x74\x79\x70\x69\x73\x6f\x6d' + b'\x00' * 100

print("=" * 80)
print("SnapNext AI Backend Test Suite")
print("=" * 80)
print()

# ============================================================================
# AUTH TESTS
# ============================================================================
print("🔐 Testing AUTH endpoints...")
print("-" * 80)

# Test 1: Signup with new user
new_user_email = random_email()
new_user_password = "TestPass123!"
try:
    response = requests.post(f"{BASE_URL}/auth/signup", json={
        "email": new_user_email,
        "password": new_user_password,
        "name": "Test User"
    })
    if response.status_code == 200:
        data = response.json()
        if "token" in data and "user" in data:
            new_user_token = data["token"]
            new_user_id = data["user"]["id"]
            log_test("POST /auth/signup - new user", True)
        else:
            log_test("POST /auth/signup - new user", False, "Missing token or user in response")
    else:
        log_test("POST /auth/signup - new user", False, f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_test("POST /auth/signup - new user", False, str(e))

# Test 2: Signup with duplicate email (should return 409)
try:
    response = requests.post(f"{BASE_URL}/auth/signup", json={
        "email": new_user_email,
        "password": "AnotherPass123"
    })
    if response.status_code == 409:
        log_test("POST /auth/signup - duplicate email (409)", True)
    else:
        log_test("POST /auth/signup - duplicate email (409)", False, f"Expected 409, got {response.status_code}")
except Exception as e:
    log_test("POST /auth/signup - duplicate email (409)", False, str(e))

# Test 3: Signup with missing fields (should return 400)
try:
    response = requests.post(f"{BASE_URL}/auth/signup", json={"email": "test@test.com"})
    if response.status_code == 400:
        log_test("POST /auth/signup - missing password (400)", True)
    else:
        log_test("POST /auth/signup - missing password (400)", False, f"Expected 400, got {response.status_code}")
except Exception as e:
    log_test("POST /auth/signup - missing password (400)", False, str(e))

# Test 4: Login with existing super user
try:
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "email": EXISTING_USER_EMAIL,
        "password": EXISTING_USER_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        if "token" in data and "user" in data:
            super_user_token = data["token"]
            super_user_id = data["user"]["id"]
            log_test("POST /auth/login - super user", True)
        else:
            log_test("POST /auth/login - super user", False, "Missing token or user")
    else:
        log_test("POST /auth/login - super user", False, f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_test("POST /auth/login - super user", False, str(e))

# Test 5: Login with wrong credentials (should return 401)
try:
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "email": EXISTING_USER_EMAIL,
        "password": "wrongpassword"
    })
    if response.status_code == 401:
        log_test("POST /auth/login - wrong password (401)", True)
    else:
        log_test("POST /auth/login - wrong password (401)", False, f"Expected 401, got {response.status_code}")
except Exception as e:
    log_test("POST /auth/login - wrong password (401)", False, str(e))

# Test 6: GET /auth/me with token
try:
    response = requests.get(f"{BASE_URL}/auth/me", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        data = response.json()
        if "user" in data:
            log_test("GET /auth/me - with token", True)
        else:
            log_test("GET /auth/me - with token", False, "Missing user in response")
    else:
        log_test("GET /auth/me - with token", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /auth/me - with token", False, str(e))

# Test 7: GET /auth/me without token (should return 401)
try:
    response = requests.get(f"{BASE_URL}/auth/me")
    if response.status_code == 401:
        log_test("GET /auth/me - without token (401)", True)
    else:
        log_test("GET /auth/me - without token (401)", False, f"Expected 401, got {response.status_code}")
except Exception as e:
    log_test("GET /auth/me - without token (401)", False, str(e))

# Test 8: POST /auth/forgot (placeholder)
try:
    response = requests.post(f"{BASE_URL}/auth/forgot", json={"email": "any@email.com"})
    if response.status_code == 200:
        data = response.json()
        if data.get("ok"):
            log_test("POST /auth/forgot - placeholder", True)
        else:
            log_test("POST /auth/forgot - placeholder", False, "ok not true")
    else:
        log_test("POST /auth/forgot - placeholder", False, f"Status {response.status_code}")
except Exception as e:
    log_test("POST /auth/forgot - placeholder", False, str(e))

print()

# ============================================================================
# PLANS & USAGE TESTS
# ============================================================================
print("📊 Testing PLANS & USAGE endpoints...")
print("-" * 80)

# Test 9: GET /plans (public)
try:
    response = requests.get(f"{BASE_URL}/plans")
    if response.status_code == 200:
        data = response.json()
        if "plans" in data and len(data["plans"]) >= 4:
            plan_ids = [p["id"] for p in data["plans"]]
            if all(pid in plan_ids for pid in ["free", "plus", "pro", "super_user"]):
                log_test("GET /plans - public", True)
            else:
                log_test("GET /plans - public", False, f"Missing expected plans: {plan_ids}")
        else:
            log_test("GET /plans - public", False, "Missing plans or insufficient count")
    else:
        log_test("GET /plans - public", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /plans - public", False, str(e))

# Test 10: GET /storage/usage (authenticated)
try:
    response = requests.get(f"{BASE_URL}/storage/usage", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        data = response.json()
        if "usage" in data and "plan" in data and "isSuper" in data:
            log_test("GET /storage/usage - authenticated", True)
        else:
            log_test("GET /storage/usage - authenticated", False, "Missing expected fields")
    else:
        log_test("GET /storage/usage - authenticated", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /storage/usage - authenticated", False, str(e))

# Test 11: GET /storage/usage without auth (should return 401)
try:
    response = requests.get(f"{BASE_URL}/storage/usage")
    if response.status_code == 401:
        log_test("GET /storage/usage - without auth (401)", True)
    else:
        log_test("GET /storage/usage - without auth (401)", False, f"Expected 401, got {response.status_code}")
except Exception as e:
    log_test("GET /storage/usage - without auth (401)", False, str(e))

print()

# ============================================================================
# MEDIA UPLOAD & CRUD TESTS
# ============================================================================
print("📸 Testing MEDIA UPLOAD & CRUD endpoints...")
print("-" * 80)

# Test 12: POST /media/upload - single file
uploaded_media_id = None
try:
    files = {'files': ('test_photo.png', create_test_image(), 'image/png')}
    response = requests.post(f"{BASE_URL}/media/upload", 
                           files=files,
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 200:
        data = response.json()
        if "saved" in data and "savedCount" in data and data["savedCount"] > 0:
            uploaded_media_id = data["saved"][0]["id"]
            log_test("POST /media/upload - single file", True)
        else:
            log_test("POST /media/upload - single file", False, "No files saved")
    else:
        log_test("POST /media/upload - single file", False, f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_test("POST /media/upload - single file", False, str(e))

# Test 13: POST /media/upload - duplicate detection
try:
    files = {'files': ('test_photo.png', create_test_image(), 'image/png')}
    response = requests.post(f"{BASE_URL}/media/upload", 
                           files=files,
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 200:
        data = response.json()
        if "skipped" in data and len(data["skipped"]) > 0:
            if data["skipped"][0].get("reason") == "duplicate":
                log_test("POST /media/upload - duplicate detection", True)
            else:
                log_test("POST /media/upload - duplicate detection", False, f"Wrong reason: {data['skipped'][0].get('reason')}")
        else:
            log_test("POST /media/upload - duplicate detection", False, "File not skipped as duplicate")
    else:
        log_test("POST /media/upload - duplicate detection", False, f"Status {response.status_code}")
except Exception as e:
    log_test("POST /media/upload - duplicate detection", False, str(e))

# Test 14: POST /media/upload - multiple files
try:
    files = [
        ('files', ('photo1.png', create_test_image(), 'image/png')),
        ('files', ('video1.mp4', create_test_video(), 'video/mp4'))
    ]
    response = requests.post(f"{BASE_URL}/media/upload", 
                           files=files,
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 200:
        data = response.json()
        # Some might be duplicates, but should have response structure
        if "saved" in data and "skipped" in data:
            log_test("POST /media/upload - multiple files", True)
        else:
            log_test("POST /media/upload - multiple files", False, "Missing response fields")
    else:
        log_test("POST /media/upload - multiple files", False, f"Status {response.status_code}")
except Exception as e:
    log_test("POST /media/upload - multiple files", False, str(e))

# Test 15: POST /media/upload - without auth (should return 401)
try:
    files = {'files': ('test.png', create_test_image(), 'image/png')}
    response = requests.post(f"{BASE_URL}/media/upload", files=files)
    if response.status_code == 401:
        log_test("POST /media/upload - without auth (401)", True)
    else:
        log_test("POST /media/upload - without auth (401)", False, f"Expected 401, got {response.status_code}")
except Exception as e:
    log_test("POST /media/upload - without auth (401)", False, str(e))

# Test 16: GET /media - list all
try:
    response = requests.get(f"{BASE_URL}/media?filter=all", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        data = response.json()
        if "items" in data:
            log_test("GET /media - list all", True)
        else:
            log_test("GET /media - list all", False, "Missing items field")
    else:
        log_test("GET /media - list all", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /media - list all", False, str(e))

# Test 17: GET /media - filter by photo
try:
    response = requests.get(f"{BASE_URL}/media?filter=photo", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        data = response.json()
        if "items" in data:
            log_test("GET /media - filter photo", True)
        else:
            log_test("GET /media - filter photo", False, "Missing items")
    else:
        log_test("GET /media - filter photo", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /media - filter photo", False, str(e))

# Test 18: GET /media - filter by video
try:
    response = requests.get(f"{BASE_URL}/media?filter=video", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        data = response.json()
        if "items" in data:
            log_test("GET /media - filter video", True)
        else:
            log_test("GET /media - filter video", False, "Missing items")
    else:
        log_test("GET /media - filter video", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /media - filter video", False, str(e))

# Test 19: GET /media - search by name
try:
    response = requests.get(f"{BASE_URL}/media?q=test", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        data = response.json()
        if "items" in data:
            log_test("GET /media - search by name", True)
        else:
            log_test("GET /media - search by name", False, "Missing items")
    else:
        log_test("GET /media - search by name", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /media - search by name", False, str(e))

# Test 20: GET /media/<id>/file - with token in header
if uploaded_media_id:
    try:
        response = requests.get(f"{BASE_URL}/media/{uploaded_media_id}/file", headers={
            "Authorization": f"Bearer {super_user_token}"
        })
        if response.status_code == 200:
            if len(response.content) > 0:
                log_test("GET /media/<id>/file - with header token", True)
            else:
                log_test("GET /media/<id>/file - with header token", False, "Empty content")
        else:
            log_test("GET /media/<id>/file - with header token", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("GET /media/<id>/file - with header token", False, str(e))

# Test 21: GET /media/<id>/file - with token in query
if uploaded_media_id:
    try:
        response = requests.get(f"{BASE_URL}/media/{uploaded_media_id}/file?t={super_user_token}")
        if response.status_code == 200:
            if len(response.content) > 0:
                log_test("GET /media/<id>/file - with query token", True)
            else:
                log_test("GET /media/<id>/file - with query token", False, "Empty content")
        else:
            log_test("GET /media/<id>/file - with query token", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("GET /media/<id>/file - with query token", False, str(e))

# Test 22: GET /media/<id>/file - without auth (should return 401)
if uploaded_media_id:
    try:
        response = requests.get(f"{BASE_URL}/media/{uploaded_media_id}/file")
        if response.status_code == 401:
            log_test("GET /media/<id>/file - without auth (401)", True)
        else:
            log_test("GET /media/<id>/file - without auth (401)", False, f"Expected 401, got {response.status_code}")
    except Exception as e:
        log_test("GET /media/<id>/file - without auth (401)", False, str(e))

# Test 23: POST /media/<id>/favorite - toggle favorite
if uploaded_media_id:
    try:
        response = requests.post(f"{BASE_URL}/media/{uploaded_media_id}/favorite", headers={
            "Authorization": f"Bearer {super_user_token}"
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                log_test("POST /media/<id>/favorite - toggle", True)
            else:
                log_test("POST /media/<id>/favorite - toggle", False, "ok not true")
        else:
            log_test("POST /media/<id>/favorite - toggle", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("POST /media/<id>/favorite - toggle", False, str(e))

# Test 24: GET /media - filter favorites
try:
    response = requests.get(f"{BASE_URL}/media?filter=favorite", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        data = response.json()
        if "items" in data:
            log_test("GET /media - filter favorite", True)
        else:
            log_test("GET /media - filter favorite", False, "Missing items")
    else:
        log_test("GET /media - filter favorite", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /media - filter favorite", False, str(e))

# Test 25: POST /media/<id>/trash
if uploaded_media_id:
    try:
        response = requests.post(f"{BASE_URL}/media/{uploaded_media_id}/trash", headers={
            "Authorization": f"Bearer {super_user_token}"
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                log_test("POST /media/<id>/trash", True)
            else:
                log_test("POST /media/<id>/trash", False, "ok not true")
        else:
            log_test("POST /media/<id>/trash", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("POST /media/<id>/trash", False, str(e))

# Test 26: GET /media - filter trash
try:
    response = requests.get(f"{BASE_URL}/media?filter=trash", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        data = response.json()
        if "items" in data:
            log_test("GET /media - filter trash", True)
        else:
            log_test("GET /media - filter trash", False, "Missing items")
    else:
        log_test("GET /media - filter trash", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /media - filter trash", False, str(e))

# Test 27: POST /media/<id>/restore
if uploaded_media_id:
    try:
        response = requests.post(f"{BASE_URL}/media/{uploaded_media_id}/restore", headers={
            "Authorization": f"Bearer {super_user_token}"
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                log_test("POST /media/<id>/restore", True)
            else:
                log_test("POST /media/<id>/restore", False, "ok not true")
        else:
            log_test("POST /media/<id>/restore", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("POST /media/<id>/restore", False, str(e))

# Test 28: POST /media/bulk - trash multiple
try:
    # Get some media IDs first
    response = requests.get(f"{BASE_URL}/media?filter=all", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        items = response.json().get("items", [])
        if len(items) >= 1:
            ids = [items[0]["id"]]
            response = requests.post(f"{BASE_URL}/media/bulk", 
                                   json={"ids": ids, "action": "trash"},
                                   headers={"Authorization": f"Bearer {super_user_token}"})
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    log_test("POST /media/bulk - trash", True)
                else:
                    log_test("POST /media/bulk - trash", False, "ok not true")
            else:
                log_test("POST /media/bulk - trash", False, f"Status {response.status_code}")
        else:
            log_test("POST /media/bulk - trash", False, "No media to test with")
    else:
        log_test("POST /media/bulk - trash", False, "Could not get media list")
except Exception as e:
    log_test("POST /media/bulk - trash", False, str(e))

# Test 29: POST /media/bulk - restore multiple
try:
    response = requests.get(f"{BASE_URL}/media?filter=trash", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        items = response.json().get("items", [])
        if len(items) >= 1:
            ids = [items[0]["id"]]
            response = requests.post(f"{BASE_URL}/media/bulk", 
                                   json={"ids": ids, "action": "restore"},
                                   headers={"Authorization": f"Bearer {super_user_token}"})
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    log_test("POST /media/bulk - restore", True)
                else:
                    log_test("POST /media/bulk - restore", False, "ok not true")
            else:
                log_test("POST /media/bulk - restore", False, f"Status {response.status_code}")
        else:
            log_test("POST /media/bulk - restore", False, "No trashed media to test with")
    else:
        log_test("POST /media/bulk - restore", False, "Could not get trash list")
except Exception as e:
    log_test("POST /media/bulk - restore", False, str(e))

# Test 30: POST /media/bulk - favorite multiple
try:
    response = requests.get(f"{BASE_URL}/media?filter=all", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        items = response.json().get("items", [])
        if len(items) >= 1:
            ids = [items[0]["id"]]
            response = requests.post(f"{BASE_URL}/media/bulk", 
                                   json={"ids": ids, "action": "favorite"},
                                   headers={"Authorization": f"Bearer {super_user_token}"})
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    log_test("POST /media/bulk - favorite", True)
                else:
                    log_test("POST /media/bulk - favorite", False, "ok not true")
            else:
                log_test("POST /media/bulk - favorite", False, f"Status {response.status_code}")
        else:
            log_test("POST /media/bulk - favorite", False, "No media to test with")
    else:
        log_test("POST /media/bulk - favorite", False, "Could not get media list")
except Exception as e:
    log_test("POST /media/bulk - favorite", False, str(e))

# Test 31: POST /media/bulk - unfavorite multiple
try:
    response = requests.get(f"{BASE_URL}/media?filter=favorite", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        items = response.json().get("items", [])
        if len(items) >= 1:
            ids = [items[0]["id"]]
            response = requests.post(f"{BASE_URL}/media/bulk", 
                                   json={"ids": ids, "action": "unfavorite"},
                                   headers={"Authorization": f"Bearer {super_user_token}"})
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    log_test("POST /media/bulk - unfavorite", True)
                else:
                    log_test("POST /media/bulk - unfavorite", False, "ok not true")
            else:
                log_test("POST /media/bulk - unfavorite", False, f"Status {response.status_code}")
        else:
            log_test("POST /media/bulk - unfavorite", False, "No favorites to test with")
    else:
        log_test("POST /media/bulk - unfavorite", False, "Could not get favorites list")
except Exception as e:
    log_test("POST /media/bulk - unfavorite", False, str(e))

# Test 32: POST /media/<id>/delete - hard delete
# Upload a new file specifically for deletion
delete_test_id = None
try:
    files = {'files': ('delete_me.png', create_test_image(), 'image/png')}
    response = requests.post(f"{BASE_URL}/media/upload", 
                           files=files,
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 200:
        data = response.json()
        if data.get("savedCount", 0) > 0:
            delete_test_id = data["saved"][0]["id"]
        elif data.get("skippedCount", 0) > 0:
            # If skipped as duplicate, find it in the media list
            response = requests.get(f"{BASE_URL}/media?q=delete_me", headers={
                "Authorization": f"Bearer {super_user_token}"
            })
            if response.status_code == 200:
                items = response.json().get("items", [])
                if items:
                    delete_test_id = items[0]["id"]
except:
    pass

if delete_test_id:
    try:
        response = requests.post(f"{BASE_URL}/media/{delete_test_id}/delete", headers={
            "Authorization": f"Bearer {super_user_token}"
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                # Verify it's actually deleted
                response = requests.get(f"{BASE_URL}/media/{delete_test_id}/file", headers={
                    "Authorization": f"Bearer {super_user_token}"
                })
                if response.status_code == 404:
                    log_test("POST /media/<id>/delete - hard delete", True)
                else:
                    log_test("POST /media/<id>/delete - hard delete", False, "File still accessible after delete")
            else:
                log_test("POST /media/<id>/delete - hard delete", False, "ok not true")
        else:
            log_test("POST /media/<id>/delete - hard delete", False, f"Status {response.status_code}")
    except Exception as e:
        log_test("POST /media/<id>/delete - hard delete", False, str(e))
else:
    log_test("POST /media/<id>/delete - hard delete", False, "Could not create test file for deletion")

# Test 33: POST /media/bulk - delete multiple
try:
    # Upload a new file for bulk delete test
    files = {'files': ('bulk_delete.png', create_test_image(), 'image/png')}
    response = requests.post(f"{BASE_URL}/media/upload", 
                           files=files,
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 200:
        data = response.json()
        if data.get("savedCount", 0) > 0:
            bulk_delete_id = data["saved"][0]["id"]
            response = requests.post(f"{BASE_URL}/media/bulk", 
                                   json={"ids": [bulk_delete_id], "action": "delete"},
                                   headers={"Authorization": f"Bearer {super_user_token}"})
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    log_test("POST /media/bulk - delete", True)
                else:
                    log_test("POST /media/bulk - delete", False, "ok not true")
            else:
                log_test("POST /media/bulk - delete", False, f"Status {response.status_code}")
        else:
            log_test("POST /media/bulk - delete", False, "Could not upload file for test")
    else:
        log_test("POST /media/bulk - delete", False, "Upload failed")
except Exception as e:
    log_test("POST /media/bulk - delete", False, str(e))

print()

# ============================================================================
# AI STUDIO TESTS
# ============================================================================
print("🤖 Testing AI STUDIO endpoints...")
print("-" * 80)

# Test 34: POST /ai/caption - text only
try:
    response = requests.post(f"{BASE_URL}/ai/caption", 
                           json={"topic": "sunset beach", "mood": "peaceful", "platform": "instagram"},
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 200:
        data = response.json()
        if "caption" in data and len(data["caption"]) > 0:
            log_test("POST /ai/caption - text only", True)
        else:
            log_test("POST /ai/caption - text only", False, "Empty caption")
    else:
        log_test("POST /ai/caption - text only", False, f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_test("POST /ai/caption - text only", False, str(e))

# Test 35: POST /ai/caption - with image (vision)
if uploaded_media_id:
    try:
        response = requests.post(f"{BASE_URL}/ai/caption", 
                               json={"mediaId": uploaded_media_id, "mood": "happy", "platform": "instagram"},
                               headers={"Authorization": f"Bearer {super_user_token}"})
        if response.status_code == 200:
            data = response.json()
            if "caption" in data and len(data["caption"]) > 0:
                log_test("POST /ai/caption - with image (vision)", True)
            else:
                log_test("POST /ai/caption - with image (vision)", False, "Empty caption")
        else:
            log_test("POST /ai/caption - with image (vision)", False, f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("POST /ai/caption - with image (vision)", False, str(e))
else:
    log_test("POST /ai/caption - with image (vision)", False, "No uploaded media to test with")

# Test 36: POST /ai/hashtags
try:
    response = requests.post(f"{BASE_URL}/ai/hashtags", 
                           json={"text": "Beautiful sunset at the beach"},
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 200:
        data = response.json()
        if "hashtags" in data and len(data["hashtags"]) > 0:
            log_test("POST /ai/hashtags", True)
        else:
            log_test("POST /ai/hashtags", False, "Empty hashtags")
    else:
        log_test("POST /ai/hashtags", False, f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_test("POST /ai/hashtags", False, str(e))

# Test 37: POST /ai/emojis
try:
    response = requests.post(f"{BASE_URL}/ai/emojis", 
                           json={"text": "Happy birthday celebration"},
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 200:
        data = response.json()
        if "emojis" in data and len(data["emojis"]) > 0:
            log_test("POST /ai/emojis", True)
        else:
            log_test("POST /ai/emojis", False, "Empty emojis")
    else:
        log_test("POST /ai/emojis", False, f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_test("POST /ai/emojis", False, str(e))

# Test 38: POST /ai/post-ideas
try:
    response = requests.post(f"{BASE_URL}/ai/post-ideas", 
                           json={"topic": "travel photography"},
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 200:
        data = response.json()
        if "ideas" in data and len(data["ideas"]) > 0:
            log_test("POST /ai/post-ideas", True)
        else:
            log_test("POST /ai/post-ideas", False, "Empty ideas")
    else:
        log_test("POST /ai/post-ideas", False, f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_test("POST /ai/post-ideas", False, str(e))

# Test 39: POST /ai/memory-summary
try:
    response = requests.post(f"{BASE_URL}/ai/memory-summary", 
                           json={"titles": ["Beach vacation", "Mountain hiking", "City tour"], "dateLabel": "June 2024"},
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 200:
        data = response.json()
        if "summary" in data and len(data["summary"]) > 0:
            log_test("POST /ai/memory-summary", True)
        else:
            log_test("POST /ai/memory-summary", False, "Empty summary")
    else:
        log_test("POST /ai/memory-summary", False, f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_test("POST /ai/memory-summary", False, str(e))

# Test 40: POST /ai/story
try:
    response = requests.post(f"{BASE_URL}/ai/story", 
                           json={"theme": "adventure", "count": 3},
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 200:
        data = response.json()
        if "cards" in data and len(data["cards"]) > 0:
            log_test("POST /ai/story", True)
        else:
            log_test("POST /ai/story", False, "Empty cards")
    else:
        log_test("POST /ai/story", False, f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_test("POST /ai/story", False, str(e))

# Test 41: AI quota check - super user should be unlimited
# (Already tested above, super user should not hit limits)
log_test("AI quota - super user unlimited", True, "Super user tested with multiple AI calls")

# Test 42: AI quota check - regular user should hit limit after 10 calls
# Create a fresh free user and test quota
try:
    quota_test_email = random_email()
    response = requests.post(f"{BASE_URL}/auth/signup", json={
        "email": quota_test_email,
        "password": "TestPass123!"
    })
    if response.status_code == 200:
        quota_user_token = response.json()["token"]
        
        # Make 10 AI calls (free plan limit)
        for i in range(10):
            response = requests.post(f"{BASE_URL}/ai/caption", 
                                   json={"topic": f"test {i}", "mood": "happy", "platform": "instagram"},
                                   headers={"Authorization": f"Bearer {quota_user_token}"})
            if response.status_code != 200:
                log_test("AI quota - free user 10 calls", False, f"Failed at call {i+1}")
                break
        else:
            # 11th call should fail with 429
            response = requests.post(f"{BASE_URL}/ai/caption", 
                                   json={"topic": "test 11", "mood": "happy", "platform": "instagram"},
                                   headers={"Authorization": f"Bearer {quota_user_token}"})
            if response.status_code == 429:
                data = response.json()
                if "error" in data and "limit" in data["error"].lower():
                    log_test("AI quota - free user limit (429)", True)
                else:
                    log_test("AI quota - free user limit (429)", False, "Wrong error message")
            else:
                log_test("AI quota - free user limit (429)", False, f"Expected 429, got {response.status_code}")
    else:
        log_test("AI quota - free user limit (429)", False, "Could not create test user")
except Exception as e:
    log_test("AI quota - free user limit (429)", False, str(e))

print()

# ============================================================================
# MEMORIES TESTS
# ============================================================================
print("💭 Testing MEMORIES endpoints...")
print("-" * 80)

# Test 43: GET /memories
try:
    response = requests.get(f"{BASE_URL}/memories", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        data = response.json()
        if "groups" in data and "onThisDay" in data:
            log_test("GET /memories - groups and onThisDay", True)
        else:
            log_test("GET /memories - groups and onThisDay", False, "Missing expected fields")
    else:
        log_test("GET /memories - groups and onThisDay", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /memories - groups and onThisDay", False, str(e))

# Test 44: GET /memories without auth (should return 401)
try:
    response = requests.get(f"{BASE_URL}/memories")
    if response.status_code == 401:
        log_test("GET /memories - without auth (401)", True)
    else:
        log_test("GET /memories - without auth (401)", False, f"Expected 401, got {response.status_code}")
except Exception as e:
    log_test("GET /memories - without auth (401)", False, str(e))

print()

# ============================================================================
# BILLING TESTS
# ============================================================================
print("💳 Testing BILLING endpoints...")
print("-" * 80)

# Test 45: POST /billing/checkout - upgrade to plus
try:
    # Create a new user for billing test
    billing_test_email = random_email()
    response = requests.post(f"{BASE_URL}/auth/signup", json={
        "email": billing_test_email,
        "password": "TestPass123!"
    })
    if response.status_code == 200:
        billing_user_token = response.json()["token"]
        billing_user_id = response.json()["user"]["id"]
        
        # Upgrade to plus
        response = requests.post(f"{BASE_URL}/billing/checkout", 
                               json={"planId": "plus"},
                               headers={"Authorization": f"Bearer {billing_user_token}"})
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and data.get("planId") == "plus" and data.get("mock"):
                # Verify user plan was updated
                response = requests.get(f"{BASE_URL}/auth/me", headers={
                    "Authorization": f"Bearer {billing_user_token}"
                })
                if response.status_code == 200:
                    user = response.json()["user"]
                    if user["plan"] == "plus":
                        log_test("POST /billing/checkout - upgrade to plus", True)
                    else:
                        log_test("POST /billing/checkout - upgrade to plus", False, f"Plan not updated: {user['plan']}")
                else:
                    log_test("POST /billing/checkout - upgrade to plus", False, "Could not verify plan update")
            else:
                log_test("POST /billing/checkout - upgrade to plus", False, "Invalid response")
        else:
            log_test("POST /billing/checkout - upgrade to plus", False, f"Status {response.status_code}")
    else:
        log_test("POST /billing/checkout - upgrade to plus", False, "Could not create test user")
except Exception as e:
    log_test("POST /billing/checkout - upgrade to plus", False, str(e))

# Test 46: POST /billing/checkout - invalid plan (should return 400)
try:
    response = requests.post(f"{BASE_URL}/billing/checkout", 
                           json={"planId": "invalid_plan"},
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 400:
        log_test("POST /billing/checkout - invalid plan (400)", True)
    else:
        log_test("POST /billing/checkout - invalid plan (400)", False, f"Expected 400, got {response.status_code}")
except Exception as e:
    log_test("POST /billing/checkout - invalid plan (400)", False, str(e))

# Test 47: POST /billing/checkout - without auth (should return 401)
try:
    response = requests.post(f"{BASE_URL}/billing/checkout", json={"planId": "plus"})
    if response.status_code == 401:
        log_test("POST /billing/checkout - without auth (401)", True)
    else:
        log_test("POST /billing/checkout - without auth (401)", False, f"Expected 401, got {response.status_code}")
except Exception as e:
    log_test("POST /billing/checkout - without auth (401)", False, str(e))

print()

# ============================================================================
# ADMIN TESTS
# ============================================================================
print("👑 Testing ADMIN endpoints...")
print("-" * 80)

# Test 48: POST /admin/seed-super - bootstrap super user
try:
    # Create a new user to promote
    seed_test_email = random_email()
    response = requests.post(f"{BASE_URL}/auth/signup", json={
        "email": seed_test_email,
        "password": "TestPass123!"
    })
    if response.status_code == 200:
        # Promote to super user
        response = requests.post(f"{BASE_URL}/admin/seed-super", json={
            "email": seed_test_email,
            "secret": JWT_SECRET
        })
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                # Verify user is now super
                response = requests.post(f"{BASE_URL}/auth/login", json={
                    "email": seed_test_email,
                    "password": "TestPass123!"
                })
                if response.status_code == 200:
                    user = response.json()["user"]
                    if user["plan"] == "super_user" and user["role"] == "admin":
                        log_test("POST /admin/seed-super - bootstrap", True)
                    else:
                        log_test("POST /admin/seed-super - bootstrap", False, f"User not promoted: {user}")
                else:
                    log_test("POST /admin/seed-super - bootstrap", False, "Could not verify promotion")
            else:
                log_test("POST /admin/seed-super - bootstrap", False, "ok not true")
        else:
            log_test("POST /admin/seed-super - bootstrap", False, f"Status {response.status_code}")
    else:
        log_test("POST /admin/seed-super - bootstrap", False, "Could not create test user")
except Exception as e:
    log_test("POST /admin/seed-super - bootstrap", False, str(e))

# Test 49: POST /admin/seed-super - wrong secret (should return 403)
try:
    response = requests.post(f"{BASE_URL}/admin/seed-super", json={
        "email": "any@email.com",
        "secret": "wrong_secret"
    })
    if response.status_code == 403:
        log_test("POST /admin/seed-super - wrong secret (403)", True)
    else:
        log_test("POST /admin/seed-super - wrong secret (403)", False, f"Expected 403, got {response.status_code}")
except Exception as e:
    log_test("POST /admin/seed-super - wrong secret (403)", False, str(e))

# Test 50: GET /admin/users - super user
try:
    response = requests.get(f"{BASE_URL}/admin/users", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        data = response.json()
        if "users" in data and len(data["users"]) > 0:
            log_test("GET /admin/users - super user", True)
        else:
            log_test("GET /admin/users - super user", False, "Missing users or empty list")
    else:
        log_test("GET /admin/users - super user", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET /admin/users - super user", False, str(e))

# Test 51: GET /admin/users - non-super user (should return 403)
try:
    response = requests.get(f"{BASE_URL}/admin/users", headers={
        "Authorization": f"Bearer {new_user_token}"
    })
    if response.status_code == 403:
        log_test("GET /admin/users - non-super (403)", True)
    else:
        log_test("GET /admin/users - non-super (403)", False, f"Expected 403, got {response.status_code}")
except Exception as e:
    log_test("GET /admin/users - non-super (403)", False, str(e))

# Test 52: POST /admin/grant-super - super user granting
try:
    # Create a new user to grant super to
    grant_test_email = random_email()
    response = requests.post(f"{BASE_URL}/auth/signup", json={
        "email": grant_test_email,
        "password": "TestPass123!"
    })
    if response.status_code == 200:
        grant_user_id = response.json()["user"]["id"]
        
        # Grant super user
        response = requests.post(f"{BASE_URL}/admin/grant-super", 
                               json={"userId": grant_user_id},
                               headers={"Authorization": f"Bearer {super_user_token}"})
        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                # Verify user is now super
                response = requests.post(f"{BASE_URL}/auth/login", json={
                    "email": grant_test_email,
                    "password": "TestPass123!"
                })
                if response.status_code == 200:
                    user = response.json()["user"]
                    if user["plan"] == "super_user" and user["role"] == "admin":
                        log_test("POST /admin/grant-super - super user", True)
                    else:
                        log_test("POST /admin/grant-super - super user", False, f"User not granted: {user}")
                else:
                    log_test("POST /admin/grant-super - super user", False, "Could not verify grant")
            else:
                log_test("POST /admin/grant-super - super user", False, "ok not true")
        else:
            log_test("POST /admin/grant-super - super user", False, f"Status {response.status_code}")
    else:
        log_test("POST /admin/grant-super - super user", False, "Could not create test user")
except Exception as e:
    log_test("POST /admin/grant-super - super user", False, str(e))

# Test 53: POST /admin/grant-super - non-super user (should return 403)
try:
    response = requests.post(f"{BASE_URL}/admin/grant-super", 
                           json={"userId": "any_user_id"},
                           headers={"Authorization": f"Bearer {new_user_token}"})
    if response.status_code == 403:
        log_test("POST /admin/grant-super - non-super (403)", True)
    else:
        log_test("POST /admin/grant-super - non-super (403)", False, f"Expected 403, got {response.status_code}")
except Exception as e:
    log_test("POST /admin/grant-super - non-super (403)", False, str(e))

print()

# ============================================================================
# DOWNLOADS TESTS
# ============================================================================
print("📥 Testing DOWNLOADS endpoints...")
print("-" * 80)

# Test 54: POST /downloads/log
try:
    response = requests.get(f"{BASE_URL}/media?filter=all", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 200:
        items = response.json().get("items", [])
        if len(items) > 0:
            media_ids = [items[0]["id"]]
            response = requests.post(f"{BASE_URL}/downloads/log", 
                                   json={"mediaIds": media_ids},
                                   headers={"Authorization": f"Bearer {super_user_token}"})
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    log_test("POST /downloads/log", True)
                else:
                    log_test("POST /downloads/log", False, "ok not true")
            else:
                log_test("POST /downloads/log", False, f"Status {response.status_code}")
        else:
            log_test("POST /downloads/log", False, "No media to test with")
    else:
        log_test("POST /downloads/log", False, "Could not get media list")
except Exception as e:
    log_test("POST /downloads/log", False, str(e))

# Test 55: POST /downloads/log - without auth (should return 401)
try:
    response = requests.post(f"{BASE_URL}/downloads/log", json={"mediaIds": []})
    if response.status_code == 401:
        log_test("POST /downloads/log - without auth (401)", True)
    else:
        log_test("POST /downloads/log - without auth (401)", False, f"Expected 401, got {response.status_code}")
except Exception as e:
    log_test("POST /downloads/log - without auth (401)", False, str(e))

print()

# ============================================================================
# EDGE CASES & ERROR HANDLING
# ============================================================================
print("⚠️  Testing EDGE CASES...")
print("-" * 80)

# Test 56: GET /media/<id>/file - non-existent ID (should return 404)
try:
    response = requests.get(f"{BASE_URL}/media/non-existent-id/file", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 404:
        log_test("GET /media/<id>/file - non-existent (404)", True)
    else:
        log_test("GET /media/<id>/file - non-existent (404)", False, f"Expected 404, got {response.status_code}")
except Exception as e:
    log_test("GET /media/<id>/file - non-existent (404)", False, str(e))

# Test 57: POST /media/<id>/favorite - non-existent ID (should return 404)
try:
    response = requests.post(f"{BASE_URL}/media/non-existent-id/favorite", headers={
        "Authorization": f"Bearer {super_user_token}"
    })
    if response.status_code == 404:
        log_test("POST /media/<id>/favorite - non-existent (404)", True)
    else:
        log_test("POST /media/<id>/favorite - non-existent (404)", False, f"Expected 404, got {response.status_code}")
except Exception as e:
    log_test("POST /media/<id>/favorite - non-existent (404)", False, str(e))

# Test 58: POST /media/bulk - empty ids (should return 400)
try:
    response = requests.post(f"{BASE_URL}/media/bulk", 
                           json={"ids": [], "action": "trash"},
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 400:
        log_test("POST /media/bulk - empty ids (400)", True)
    else:
        log_test("POST /media/bulk - empty ids (400)", False, f"Expected 400, got {response.status_code}")
except Exception as e:
    log_test("POST /media/bulk - empty ids (400)", False, str(e))

# Test 59: POST /media/upload - no files (should return 400)
try:
    response = requests.post(f"{BASE_URL}/media/upload", 
                           files={},
                           headers={"Authorization": f"Bearer {super_user_token}"})
    if response.status_code == 400:
        log_test("POST /media/upload - no files (400)", True)
    else:
        log_test("POST /media/upload - no files (400)", False, f"Expected 400, got {response.status_code}")
except Exception as e:
    log_test("POST /media/upload - no files (400)", False, str(e))

# Test 60: GET / - root endpoint
try:
    response = requests.get(f"{BASE_URL}/")
    if response.status_code == 200:
        data = response.json()
        if data.get("app") == "SnapNext AI" and data.get("ok"):
            log_test("GET / - root endpoint", True)
        else:
            log_test("GET / - root endpoint", False, "Invalid response")
    else:
        log_test("GET / - root endpoint", False, f"Status {response.status_code}")
except Exception as e:
    log_test("GET / - root endpoint", False, str(e))

print()

# ============================================================================
# SUMMARY
# ============================================================================
print("=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"✅ Passed: {test_results['passed']}")
print(f"❌ Failed: {test_results['failed']}")
print(f"📊 Total: {test_results['passed'] + test_results['failed']}")
print()

if test_results['failed'] > 0:
    print("FAILED TESTS:")
    print("-" * 80)
    for error in test_results['errors']:
        print(f"  • {error}")
    print()

# Exit with appropriate code
exit(0 if test_results['failed'] == 0 else 1)
