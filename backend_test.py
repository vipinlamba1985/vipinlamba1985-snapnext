#!/usr/bin/env python3
"""
SnapNext AI - Security & Authorization Backend Test
Tests isSuper authorization, preview/admin token access, anonymous request blocking,
middleware redirects, and public branding assets.
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3000"
API_URL = f"{BASE_URL}/api"
PREVIEW_TOKEN = "preview-demo-token"

# Test counters
passed = 0
failed = 0
test_results = []

def test(name, condition, details=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"✅ {name}")
        test_results.append({"name": name, "status": "PASS", "details": details})
    else:
        failed += 1
        print(f"❌ {name}")
        if details:
            print(f"   Details: {details}")
        test_results.append({"name": name, "status": "FAIL", "details": details})

def get_json(url, headers=None):
    try:
        r = requests.get(url, headers=headers, timeout=10)
        return r.status_code, r.json() if r.headers.get('content-type', '').startswith('application/json') else None
    except Exception as e:
        return None, str(e)

def post_json(url, data=None, headers=None):
    try:
        r = requests.post(url, json=data, headers=headers, timeout=10)
        return r.status_code, r.json() if r.headers.get('content-type', '').startswith('application/json') else None
    except Exception as e:
        return None, str(e)

print("=" * 80)
print("SNAPNEXT AI - SECURITY & AUTHORIZATION BACKEND TEST")
print("=" * 80)
print()

# ============================================================================
# TEST 1: isSuper Authorization - Preview/Admin Token Works
# ============================================================================
print("TEST 1: isSuper Authorization - Preview/Admin Token Access")
print("-" * 80)

headers_with_token = {"Authorization": f"Bearer {PREVIEW_TOKEN}"}

# 1.1 /api/auth/me with preview-demo-token
status, data = get_json(f"{API_URL}/auth/me", headers_with_token)
test(
    "1.1 /api/auth/me with preview-demo-token returns 200",
    status == 200,
    f"Status: {status}, Data: {json.dumps(data) if data else 'None'}"
)
if status == 200 and data:
    test(
        "1.2 /api/auth/me returns user with admin role",
        data.get('user', {}).get('role') == 'admin',
        f"Role: {data.get('user', {}).get('role')}"
    )
    test(
        "1.3 /api/auth/me returns user with admin plan",
        data.get('user', {}).get('plan') == 'admin',
        f"Plan: {data.get('user', {}).get('plan')}"
    )
else:
    test("1.2 /api/auth/me returns user with admin role", False, "No user data")
    test("1.3 /api/auth/me returns user with admin plan", False, "No user data")

# 1.4 /api/admin/users with preview-demo-token
status, data = get_json(f"{API_URL}/admin/users", headers_with_token)
test(
    "1.4 /api/admin/users with preview-demo-token returns 200",
    status == 200,
    f"Status: {status}"
)

# 1.5 /api/ai/analytics with preview-demo-token
status, data = get_json(f"{API_URL}/ai/analytics", headers_with_token)
test(
    "1.5 /api/ai/analytics with preview-demo-token returns 200",
    status == 200,
    f"Status: {status}"
)

print()

# ============================================================================
# TEST 2: AI OS Routes - Preview/Admin Token Access
# ============================================================================
print("TEST 2: AI OS Routes - Preview/Admin Token Access")
print("-" * 80)

ai_os_routes = [
    ("status", "GET", None),
    ("agents", "GET", None),
    ("preview", "POST", {"task": "test task", "feature": "chat"}),
    ("video", "GET", None),
    ("governance", "GET", None),
    ("safety", "GET", None),
    ("business", "GET", None),
    ("scorecards", "GET", None),
    ("certification", "GET", None),
    ("alerts", "GET", None),
]

for idx, (route, method, payload) in enumerate(ai_os_routes, start=1):
    url = f"{API_URL}/ai-os/{route}"
    if method == "GET":
        status, data = get_json(url, headers_with_token)
    else:
        status, data = post_json(url, payload, headers_with_token)
    
    test(
        f"2.{idx} /api/ai-os/{route} with preview-demo-token returns 200",
        status == 200,
        f"Status: {status}, Method: {method}"
    )

print()

# ============================================================================
# TEST 3: Anonymous Requests - Should Return 401/403
# ============================================================================
print("TEST 3: Anonymous Requests to Admin/Super User APIs - Should Return 401/403")
print("-" * 80)

anonymous_tests = [
    ("/api/auth/me", "GET", None, 401),
    ("/api/admin/users", "GET", None, [401, 403]),
    ("/api/admin/grant-super", "POST", {"userId": "test"}, [401, 403]),
    ("/api/admin/seed-super", "POST", {"email": "test@test.com", "secret": "wrong"}, 403),
    ("/api/ai/analytics", "GET", None, 401),
    ("/api/ai-os/status", "GET", None, 401),
    ("/api/ai-os/agents", "GET", None, 401),
    ("/api/ai-os/preview", "POST", {"task": "test"}, 401),
    ("/api/ai-os/governance", "GET", None, 401),
    ("/api/ai-os/safety", "GET", None, 401),
]

for idx, (endpoint, method, payload, expected_status) in enumerate(anonymous_tests, start=1):
    if method == "GET":
        status, data = get_json(f"{BASE_URL}{endpoint}")
    else:
        status, data = post_json(f"{BASE_URL}{endpoint}", payload)
    
    if isinstance(expected_status, list):
        condition = status in expected_status
        expected_str = f"{expected_status[0]} or {expected_status[1]}"
    else:
        condition = status == expected_status
        expected_str = str(expected_status)
    
    test(
        f"3.{idx} {endpoint} without auth returns {expected_str}",
        condition,
        f"Status: {status}, Expected: {expected_str}"
    )

print()

# ============================================================================
# TEST 4: Middleware Redirects for Protected Frontend Routes
# ============================================================================
print("TEST 4: Middleware Redirects for Protected Frontend Routes (No Auth)")
print("-" * 80)

protected_routes = [
    "/admin",
    "/ai-command",
    "/ai-video",
    "/ai-studio",
]

for idx, route in enumerate(protected_routes, start=1):
    try:
        r = requests.get(f"{BASE_URL}{route}", allow_redirects=False, timeout=10)
        is_redirect = r.status_code in [301, 302, 303, 307, 308]
        redirect_to_login = False
        if is_redirect:
            location = r.headers.get('Location', '')
            redirect_to_login = '/login' in location
        
        test(
            f"4.{idx} {route} without auth redirects to /login",
            is_redirect and redirect_to_login,
            f"Status: {r.status_code}, Location: {r.headers.get('Location', 'None')}"
        )
    except Exception as e:
        test(f"4.{idx} {route} without auth redirects to /login", False, str(e))

print()

# ============================================================================
# TEST 5: App Shell Route Metadata - adminOnly Flags
# ============================================================================
print("TEST 5: App Shell Route Metadata - adminOnly Flags (Code Inspection)")
print("-" * 80)

# Read AppShell.js and verify adminOnly flags
try:
    with open('/app/components/AppShell.js', 'r') as f:
        content = f.read()
    
    admin_routes = [
        ("'/ai-studio'", "adminOnly: true"),
        ("'/ai-video'", "adminOnly: true"),
        ("'/ai-command'", "adminOnly: true"),
        ("'/admin'", "adminOnly: true"),
    ]
    
    for idx, (route, flag) in enumerate(admin_routes, start=1):
        # Check if route exists with adminOnly flag
        route_found = route in content
        flag_found = False
        if route_found:
            # Find the line with the route and check nearby lines for adminOnly
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if route in line:
                    # Check current line and next 2 lines for adminOnly
                    check_lines = '\n'.join(lines[i:i+3])
                    flag_found = 'adminOnly: true' in check_lines
                    break
        
        test(
            f"5.{idx} {route} has adminOnly: true in AppShell.js",
            route_found and flag_found,
            f"Route found: {route_found}, Flag found: {flag_found}"
        )
except Exception as e:
    test("5.1 AppShell.js code inspection", False, str(e))

print()

# ============================================================================
# TEST 6: Public Branding Assets - Existence and Content Type
# ============================================================================
print("TEST 6: Public Branding Assets - Existence and Content Type")
print("-" * 80)

branding_assets = [
    ("/logo.svg", "image/svg+xml"),
    ("/logo.png", "image/png"),
    ("/logo-light.png", "image/png"),
    ("/logo-dark.png", "image/png"),
    ("/logo-white.png", "image/png"),
    ("/favicon.ico", ["image/x-icon", "image/vnd.microsoft.icon"]),
    ("/favicon-16x16.png", "image/png"),
    ("/favicon-32x32.png", "image/png"),
    ("/apple-touch-icon.png", "image/png"),
    ("/android-chrome-192x192.png", "image/png"),
    ("/android-chrome-512x512.png", "image/png"),
    ("/maskable-icon-512x512.png", "image/png"),
    ("/og-image.png", "image/png"),
    ("/twitter-image.png", "image/png"),
    ("/manifest.json", "application/json"),
]

for idx, asset_info in enumerate(branding_assets, start=1):
    asset_path = asset_info[0]
    expected_type = asset_info[1]
    
    try:
        r = requests.get(f"{BASE_URL}{asset_path}", timeout=10)
        status_ok = r.status_code == 200
        content_type = r.headers.get('content-type', '').split(';')[0].strip()
        
        if isinstance(expected_type, list):
            type_ok = content_type in expected_type
            expected_str = " or ".join(expected_type)
        else:
            type_ok = content_type == expected_type
            expected_str = expected_type
        
        test(
            f"6.{idx} {asset_path} returns 200 with correct content-type",
            status_ok and type_ok,
            f"Status: {r.status_code}, Content-Type: {content_type}, Expected: {expected_str}"
        )
    except Exception as e:
        test(f"6.{idx} {asset_path} returns 200 with correct content-type", False, str(e))

print()

# ============================================================================
# TEST 7: Additional Security Checks
# ============================================================================
print("TEST 7: Additional Security Checks")
print("-" * 80)

# 7.1 Verify isSuper logic works for both plan and role
status, data = get_json(f"{API_URL}/auth/me", headers_with_token)
if status == 200 and data:
    user = data.get('user', {})
    is_super_by_role = user.get('role') == 'admin'
    is_super_by_plan = user.get('plan') in ['super_user', 'admin']
    test(
        "7.1 isSuper authorization works (role=admin OR plan=super_user/admin)",
        is_super_by_role or is_super_by_plan,
        f"Role: {user.get('role')}, Plan: {user.get('plan')}"
    )
else:
    test("7.1 isSuper authorization works", False, "Could not verify user")

# 7.2 Verify non-super user cannot access admin endpoints (using wrong token)
wrong_headers = {"Authorization": "Bearer wrong-token"}
status, data = get_json(f"{API_URL}/admin/users", wrong_headers)
test(
    "7.2 Invalid token cannot access /api/admin/users",
    status in [401, 403],
    f"Status: {status}"
)

# 7.3 Verify AI OS routes require authentication
status, data = get_json(f"{API_URL}/ai-os/status")
test(
    "7.3 /api/ai-os/status without auth returns 401",
    status == 401,
    f"Status: {status}"
)

print()

# ============================================================================
# SUMMARY
# ============================================================================
print("=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"Total Tests: {passed + failed}")
print(f"✅ Passed: {passed}")
print(f"❌ Failed: {failed}")
print(f"Success Rate: {(passed / (passed + failed) * 100):.1f}%")
print()

if failed > 0:
    print("FAILED TESTS:")
    for result in test_results:
        if result["status"] == "FAIL":
            print(f"  ❌ {result['name']}")
            if result["details"]:
                print(f"     {result['details']}")
    print()

print("=" * 80)
print("SECURITY VERIFICATION COMPLETE")
print("=" * 80)

sys.exit(0 if failed == 0 else 1)
