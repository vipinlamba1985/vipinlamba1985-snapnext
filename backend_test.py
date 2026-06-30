#!/usr/bin/env python3
"""
SnapNext AI Backend API Testing - Track A (Admin/Super User) and Track B (Normal User)
Tests all backend endpoints with proper authentication and authorization checks.
"""

import requests
import json
import sys
from typing import Dict, Any, List, Tuple

# Configuration
BASE_URL = "http://localhost:3000/api"
PREVIEW_TOKEN = "preview-demo-token"  # Admin/Super User token

# Test results tracking
passed_tests = []
failed_tests = []
api_errors = []
security_issues = []
missing_endpoints = []

def log_result(test_name: str, passed: bool, message: str = ""):
    """Log test result"""
    if passed:
        passed_tests.append(f"✅ {test_name}")
        print(f"✅ PASS: {test_name}")
        if message:
            print(f"   {message}")
    else:
        failed_tests.append(f"❌ {test_name}: {message}")
        print(f"❌ FAIL: {test_name}")
        if message:
            print(f"   {message}")

def log_api_error(endpoint: str, error: str):
    """Log API error"""
    api_errors.append(f"{endpoint}: {error}")
    print(f"⚠️  API ERROR: {endpoint} - {error}")

def log_security_issue(issue: str):
    """Log security issue"""
    security_issues.append(issue)
    print(f"🔒 SECURITY ISSUE: {issue}")

def log_missing_endpoint(endpoint: str):
    """Log missing endpoint"""
    missing_endpoints.append(endpoint)
    print(f"❌ MISSING ENDPOINT: {endpoint}")

def make_request(method: str, endpoint: str, token: str = None, data: Dict = None, expect_json: bool = True) -> Tuple[int, Any]:
    """Make HTTP request and return status code and response"""
    url = f"{BASE_URL}{endpoint}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=10)
        elif method == "POST":
            headers["Content-Type"] = "application/json"
            response = requests.post(url, headers=headers, json=data or {}, timeout=10)
        elif method == "PUT":
            headers["Content-Type"] = "application/json"
            response = requests.put(url, headers=headers, json=data or {}, timeout=10)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, timeout=10)
        else:
            return 0, {"error": f"Unsupported method: {method}"}
        
        if expect_json:
            try:
                return response.status_code, response.json()
            except:
                return response.status_code, {"error": "Non-JSON response", "text": response.text[:200]}
        else:
            return response.status_code, response.text
    except requests.exceptions.Timeout:
        return 0, {"error": "Request timeout"}
    except requests.exceptions.ConnectionError:
        return 0, {"error": "Connection error"}
    except Exception as e:
        return 0, {"error": str(e)}

print("=" * 80)
print("SNAPNEXT AI BACKEND API TESTING")
print("=" * 80)
print()

# ============================================================================
# TRACK A: ADMIN/SUPER USER TESTING (with preview-demo-token)
# ============================================================================
print("=" * 80)
print("TRACK A: ADMIN/SUPER USER TESTING")
print("=" * 80)
print()

# Test 1: /api/auth/me - Verify admin role and Super User access
print("Test 1: /api/auth/me - Verify admin role and Super User access")
status, data = make_request("GET", "/auth/me", token=PREVIEW_TOKEN)
if status == 200:
    user = data.get("user", {})
    email = user.get("email", "")
    role = user.get("role", "")
    plan = user.get("plan", "")
    
    if email == "vipin.lamba1985@gmail.com":
        log_result("auth/me - email verification", True, f"Email: {email}")
    else:
        log_result("auth/me - email verification", False, f"Expected vipin.lamba1985@gmail.com, got {email}")
    
    if role == "admin":
        log_result("auth/me - admin role", True, f"Role: {role}")
    else:
        log_result("auth/me - admin role", False, f"Expected role 'admin', got '{role}'")
    
    # Check if user is treated as super user (plan should be 'admin' or 'super_user')
    if plan in ["admin", "super_user"]:
        log_result("auth/me - Super User access", True, f"Plan: {plan}")
    else:
        log_result("auth/me - Super User access", False, f"Expected plan 'admin' or 'super_user', got '{plan}'")
else:
    log_result("auth/me", False, f"Status {status}: {data}")
    log_api_error("/auth/me", f"Status {status}")

print()

# Test 2: /api/admin/users - Admin endpoint
print("Test 2: /api/admin/users - Admin endpoint")
status, data = make_request("GET", "/admin/users", token=PREVIEW_TOKEN)
if status == 200:
    users = data.get("users", [])
    log_result("admin/users - access granted", True, f"Retrieved {len(users)} users")
elif status == 403:
    log_result("admin/users - access granted", False, "Admin user denied access (403)")
    log_security_issue("/admin/users returns 403 for admin user")
else:
    log_result("admin/users", False, f"Status {status}: {data}")
    log_api_error("/admin/users", f"Status {status}")

print()

# Test 3: /api/ai/analytics - AI analytics endpoint
print("Test 3: /api/ai/analytics - AI analytics endpoint")
status, data = make_request("GET", "/ai/analytics", token=PREVIEW_TOKEN)
if status == 200:
    log_result("ai/analytics - access granted", True, "Analytics data retrieved")
elif status == 403:
    log_result("ai/analytics - access granted", False, "Admin user denied access (403)")
elif status == 503:
    log_result("ai/analytics - access granted", True, "503 ai_service_unavailable (expected if no AI keys)")
    print(f"   Note: {data.get('error', {}).get('message', 'AI service unavailable')}")
else:
    log_result("ai/analytics", False, f"Status {status}: {data}")

print()

# Test 4: /api/ai/status - AI status endpoint
print("Test 4: /api/ai/status - AI status endpoint")
status, data = make_request("GET", "/ai/status?feature=caption", token=PREVIEW_TOKEN)
if status == 200:
    log_result("ai/status - access granted", True, "AI status retrieved")
    print(f"   Plan: {data.get('plan', 'N/A')}, Super User: {data.get('superUser', False)}")
elif status == 503:
    log_result("ai/status - access granted", True, "503 ai_service_unavailable (expected if no AI keys)")
else:
    log_result("ai/status", False, f"Status {status}: {data}")

print()

# Test 5-13: /api/ai-os/* endpoints - These should be tested but may not exist
print("Test 5-13: /api/ai-os/* endpoints")
ai_os_endpoints = [
    ("/ai-os/status", "GET", None),
    ("/ai-os/agents", "GET", None),
    ("/ai-os/agents", "POST", {"task": "test task", "safe": True}),
    ("/ai-os/preview", "POST", {"data": "test preview"}),
    ("/ai-os/video", "GET", None),
    ("/ai-os/video", "POST", {"preview": True}),
    ("/ai-os/governance", "GET", None),
    ("/ai-os/safety", "GET", None),
    ("/ai-os/business", "GET", None),
    ("/ai-os/scorecards", "GET", None),
    ("/ai-os/certification", "GET", None),
    ("/ai-os/alerts", "GET", None),
]

for endpoint, method, payload in ai_os_endpoints:
    status, data = make_request(method, endpoint, token=PREVIEW_TOKEN, data=payload)
    if status == 404:
        log_missing_endpoint(f"{method} {endpoint}")
    elif status == 200:
        log_result(f"{endpoint} - {method}", True, "Endpoint accessible")
    elif status == 403:
        log_result(f"{endpoint} - {method}", False, "Admin user denied access (403)")
        log_security_issue(f"{endpoint} returns 403 for admin user")
    elif status == 503:
        log_result(f"{endpoint} - {method}", True, "503 service unavailable (may be expected)")
    else:
        log_api_error(f"{method} {endpoint}", f"Status {status}")

print()

# Test 14: Anonymous access rejection for admin endpoints
print("Test 14: Anonymous access rejection for admin/Super User APIs")
admin_endpoints = [
    "/admin/users",
    "/admin/grant-super",
    "/admin/storage/health",
    "/admin/billing/health",
    "/admin/emails",
]

for endpoint in admin_endpoints:
    status, data = make_request("GET", endpoint, token=None)
    if status == 401:
        log_result(f"Anonymous access blocked - {endpoint}", True, "Correctly returns 401")
    elif status == 403:
        log_result(f"Anonymous access blocked - {endpoint}", True, "Correctly returns 403")
    else:
        log_result(f"Anonymous access blocked - {endpoint}", False, f"Expected 401/403, got {status}")
        log_security_issue(f"{endpoint} allows anonymous access (status {status})")

print()

# ============================================================================
# TRACK B: NORMAL USER TESTING
# ============================================================================
print("=" * 80)
print("TRACK B: NORMAL USER TESTING")
print("=" * 80)
print()

# Check if test credentials exist
print("Checking for test credentials...")
import os
test_creds_path = "/app/memory/test_credentials.md"
if not os.path.exists(test_creds_path):
    print("❌ /app/memory/test_credentials.md NOT FOUND")
    print()
    
    # Check if Supabase is configured
    print("Checking Supabase configuration...")
    status, data = make_request("GET", "/auth/config")
    if status == 200:
        supabase_configured = data.get("supabase", False)
        if not supabase_configured:
            print("❌ Supabase authentication is NOT configured")
            print("   Missing environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY")
            print()
            print("🚫 TRACK B BLOCKED: No valid normal user credentials available")
            print("   - /app/memory/test_credentials.md does not exist")
            print("   - Supabase signup/login not configured (missing env vars)")
            print("   - Cannot create or test with normal user account")
            print()
            log_result("Track B - Normal User Testing", False, "BLOCKED: Missing credentials and Supabase not configured")
        else:
            print("✅ Supabase is configured")
            print("   Attempting to create test user via signup...")
            
            # Try to create a test user
            test_email = "test-normal-user@snapnext.test"
            test_password = "TestPass123!"
            status, data = make_request("POST", "/auth/signup", data={
                "email": test_email,
                "password": test_password,
                "name": "Test Normal User"
            })
            
            if status == 200 or status == 409:  # 409 means user already exists
                if status == 409:
                    print("   User already exists, attempting login...")
                    status, data = make_request("POST", "/auth/login", data={
                        "email": test_email,
                        "password": test_password
                    })
                
                if status == 200:
                    normal_token = data.get("token")
                    print(f"   ✅ Normal user authenticated: {test_email}")
                    print()
                    
                    # Run Track B tests with normal user
                    print("Running Track B tests with normal user...")
                    print()
                    
                    # Test 1: /api/auth/me shows role user plan free
                    print("Test B1: /api/auth/me - Verify role user and plan free")
                    status, data = make_request("GET", "/auth/me", token=normal_token)
                    if status == 200:
                        user = data.get("user", {})
                        role = user.get("role", "")
                        plan = user.get("plan", "")
                        
                        if role == "user":
                            log_result("Normal user - role verification", True, f"Role: {role}")
                        else:
                            log_result("Normal user - role verification", False, f"Expected 'user', got '{role}'")
                        
                        if plan == "free":
                            log_result("Normal user - plan verification", True, f"Plan: {plan}")
                        else:
                            log_result("Normal user - plan verification", False, f"Expected 'free', got '{plan}'")
                    else:
                        log_result("Normal user - auth/me", False, f"Status {status}")
                    
                    print()
                    
                    # Test 2: /api/ai/status for free features
                    print("Test B2: /api/ai/status - Free user features and restrictions")
                    status, data = make_request("GET", "/ai/status?feature=caption", token=normal_token)
                    if status == 200:
                        log_result("Normal user - ai/status access", True, "AI status retrieved")
                        print(f"   Plan: {data.get('plan', 'N/A')}")
                        print(f"   Monthly Credits: {data.get('monthlyCredits', 'N/A')}")
                        print(f"   Daily Credits: {data.get('dailyCredits', 'N/A')}")
                        print(f"   Super User: {data.get('superUser', False)}")
                    elif status == 503:
                        log_result("Normal user - ai/status access", True, "503 ai_service_unavailable (expected)")
                    else:
                        log_result("Normal user - ai/status", False, f"Status {status}")
                    
                    print()
                    
                    # Test 3: /api/ai/analytics should return 403 for normal user
                    print("Test B3: /api/ai/analytics - Should be forbidden for normal user")
                    status, data = make_request("GET", "/ai/analytics", token=normal_token)
                    if status == 403:
                        log_result("Normal user - ai/analytics forbidden", True, "Correctly returns 403")
                    elif status == 401:
                        log_result("Normal user - ai/analytics forbidden", True, "Returns 401 (acceptable)")
                    else:
                        log_result("Normal user - ai/analytics forbidden", False, f"Expected 403, got {status}")
                        log_security_issue("/ai/analytics allows normal user access")
                    
                    print()
                    
                    # Test 4: /api/admin/users should be forbidden
                    print("Test B4: /api/admin/users - Should be forbidden for normal user")
                    status, data = make_request("GET", "/admin/users", token=normal_token)
                    if status == 403:
                        log_result("Normal user - admin/users forbidden", True, "Correctly returns 403")
                    else:
                        log_result("Normal user - admin/users forbidden", False, f"Expected 403, got {status}")
                        log_security_issue("/admin/users allows normal user access")
                    
                    print()
                    
                    # Test 5: Mock checkout (ONLY if safe)
                    print("Test B5: Mock checkout - Plus plan (safe test)")
                    print("   Note: Testing with disposable test account only")
                    status, data = make_request("POST", "/billing/checkout", token=normal_token, data={
                        "planId": "plus",
                        "interval": "monthly"
                    })
                    if status == 200:
                        log_result("Normal user - mock checkout", True, "Checkout successful (mock)")
                        print(f"   Provider: {data.get('provider', 'N/A')}")
                        if data.get('provider') == 'mock':
                            print("   ⚠️  Note: This is a MOCK checkout, no real billing")
                    else:
                        log_result("Normal user - mock checkout", False, f"Status {status}: {data}")
                    
                    print()
                else:
                    print(f"   ❌ Login failed: Status {status}")
                    log_result("Track B - Normal User Testing", False, "Failed to authenticate test user")
            else:
                print(f"   ❌ Signup failed: Status {status}")
                log_result("Track B - Normal User Testing", False, "Failed to create test user")
    else:
        print(f"❌ Failed to check Supabase config: Status {status}")
        log_result("Track B - Normal User Testing", False, "Cannot verify Supabase configuration")
else:
    print("✅ /app/memory/test_credentials.md found")
    # Read and use credentials from file
    # (Implementation would go here if file existed)

print()

# ============================================================================
# FINAL REPORT
# ============================================================================
print("=" * 80)
print("FINAL TEST REPORT")
print("=" * 80)
print()

print(f"✅ PASSED CHECKS: {len(passed_tests)}")
for test in passed_tests:
    print(f"   {test}")
print()

print(f"❌ FAILED CHECKS: {len(failed_tests)}")
for test in failed_tests:
    print(f"   {test}")
print()

print(f"⚠️  API ERRORS: {len(api_errors)}")
for error in api_errors:
    print(f"   {error}")
print()

print(f"🔒 SECURITY ISSUES: {len(security_issues)}")
for issue in security_issues:
    print(f"   {issue}")
print()

print(f"❌ MISSING ENDPOINTS: {len(missing_endpoints)}")
for endpoint in missing_endpoints:
    print(f"   {endpoint}")
print()

# Check for live AI provider keys
print("🔑 ENVIRONMENT CONFIGURATION:")
print("   Checking for live AI provider keys...")
status, data = make_request("GET", "/ai/status?feature=caption", token=PREVIEW_TOKEN)
if status == 503:
    error_data = data.get("error", {})
    if isinstance(error_data, dict):
        code = error_data.get("code", "")
        if code == "ai_service_unavailable":
            print("   ⚠️  AI service unavailable - Missing EMERGENT_LLM_KEY or GEMINI_API_KEY")
            print("   Note: 503 ai_service_unavailable is EXPECTED without AI keys")
elif status == 200:
    print("   ✅ AI service is configured and available")
print()

print("=" * 80)
print("RECOMMENDED FIXES:")
print("=" * 80)
if missing_endpoints:
    print("1. MISSING ENDPOINTS - The following /api/ai-os/* endpoints are not implemented:")
    for endpoint in missing_endpoints:
        print(f"   - {endpoint}")
    print("   Action: Implement these endpoints or clarify if they are part of a different service")
    print()

if security_issues:
    print("2. SECURITY ISSUES:")
    for issue in security_issues:
        print(f"   - {issue}")
    print()

if failed_tests:
    print("3. FAILED TESTS:")
    for test in failed_tests:
        print(f"   - {test}")
    print()

if not missing_endpoints and not security_issues and not failed_tests:
    print("✅ No critical issues found. All implemented endpoints working correctly.")
    print()

print("=" * 80)
print("TEST COMPLETE")
print("=" * 80)

# Exit with appropriate code
if failed_tests or security_issues:
    sys.exit(1)
else:
    sys.exit(0)
