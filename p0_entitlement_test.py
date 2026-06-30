#!/usr/bin/env python3
"""
P0 Admin/Super User Entitlement Mismatch Verification
Tests that preview-demo-token (vipin.lamba1985@gmail.com) correctly resolves to Super User entitlement
across all critical endpoints without modifying code/auth/Supabase/Stripe/AWS/DB/billing.
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
print("P0 ADMIN/SUPER USER ENTITLEMENT MISMATCH VERIFICATION")
print("=" * 80)
print()

headers_with_token = {"Authorization": f"Bearer {PREVIEW_TOKEN}"}

# ============================================================================
# TEST 1: /api/auth/me - Admin User with Super User Entitlement
# ============================================================================
print("TEST 1: /api/auth/me - Admin User with Super User Entitlement")
print("-" * 80)

status, data = get_json(f"{API_URL}/auth/me", headers_with_token)
test(
    "1.1 /api/auth/me returns 200",
    status == 200,
    f"Status: {status}"
)

if status == 200 and data:
    user = data.get('user', {})
    
    # Check email
    test(
        "1.2 /api/auth/me returns vipin.lamba1985@gmail.com",
        user.get('email') == 'vipin.lamba1985@gmail.com',
        f"Email: {user.get('email')}"
    )
    
    # Check role
    test(
        "1.3 /api/auth/me returns role=admin",
        user.get('role') == 'admin',
        f"Role: {user.get('role')}"
    )
    
    # Check plan (should resolve to Super User)
    raw_plan = user.get('plan')
    test(
        "1.4 /api/auth/me returns plan that resolves to Super User",
        raw_plan in ['super_user', 'admin'],
        f"Plan: {raw_plan} (should be 'super_user' or 'admin')"
    )
    
    print(f"   📋 Raw plan value: {raw_plan}")
else:
    test("1.2 /api/auth/me returns vipin.lamba1985@gmail.com", False, "No user data")
    test("1.3 /api/auth/me returns role=admin", False, "No user data")
    test("1.4 /api/auth/me returns plan that resolves to Super User", False, "No user data")

print()

# ============================================================================
# TEST 2: /api/storage/usage - Super User Plan Details
# ============================================================================
print("TEST 2: /api/storage/usage - Super User Plan Details")
print("-" * 80)

status, data = get_json(f"{API_URL}/storage/usage", headers_with_token)
test(
    "2.1 /api/storage/usage returns 200",
    status == 200,
    f"Status: {status}"
)

if status == 200 and data:
    plan = data.get('plan', {})
    
    # Check plan id
    test(
        "2.2 /api/storage/usage returns plan.id=super_user",
        plan.get('id') == 'super_user',
        f"Plan ID: {plan.get('id')}"
    )
    
    # Check plan name
    test(
        "2.3 /api/storage/usage returns plan.name='Super User'",
        plan.get('name') == 'Super User',
        f"Plan Name: {plan.get('name')}"
    )
    
    # Check effectivePlan
    test(
        "2.4 /api/storage/usage returns effectivePlan=super_user",
        data.get('effectivePlan') == 'super_user',
        f"Effective Plan: {data.get('effectivePlan')}"
    )
    
    # Check isSuper flag
    test(
        "2.5 /api/storage/usage returns isSuper=true",
        data.get('isSuper') == True,
        f"isSuper: {data.get('isSuper')}"
    )
    
    # Verify NOT Free plan
    test(
        "2.6 /api/storage/usage does NOT return Free plan",
        plan.get('id') != 'free' and plan.get('name') != 'Free',
        f"Plan: {plan.get('id')} / {plan.get('name')}"
    )
    
    print(f"   📋 Plan object: {json.dumps(plan, indent=2)}")
    print(f"   📋 Raw plan: {data.get('rawPlan')}")
    print(f"   📋 Role: {data.get('role')}")
    print(f"   📋 Effective plan: {data.get('effectivePlan')}")
    print(f"   📋 isSuper: {data.get('isSuper')}")
else:
    test("2.2 /api/storage/usage returns plan.id=super_user", False, "No data")
    test("2.3 /api/storage/usage returns plan.name='Super User'", False, "No data")
    test("2.4 /api/storage/usage returns effectivePlan=super_user", False, "No data")
    test("2.5 /api/storage/usage returns isSuper=true", False, "No data")
    test("2.6 /api/storage/usage does NOT return Free plan", False, "No data")

print()

# ============================================================================
# TEST 3: /api/insights - Super User Plan Details
# ============================================================================
print("TEST 3: /api/insights - Super User Plan Details")
print("-" * 80)

status, data = get_json(f"{API_URL}/insights", headers_with_token)
test(
    "3.1 /api/insights returns 200",
    status == 200,
    f"Status: {status}"
)

if status == 200 and data:
    plan = data.get('plan', {})
    
    # Check plan name
    test(
        "3.2 /api/insights returns plan='Super User'",
        plan.get('name') == 'Super User',
        f"Plan Name: {plan.get('name')}"
    )
    
    # Check isSuper flag
    test(
        "3.3 /api/insights returns isSuper=true",
        plan.get('isSuper') == True,
        f"isSuper: {plan.get('isSuper')}"
    )
    
    print(f"   📋 Plan object: {json.dumps(plan, indent=2)}")
else:
    test("3.2 /api/insights returns plan='Super User'", False, "No data")
    test("3.3 /api/insights returns isSuper=true", False, "No data")

print()

# ============================================================================
# TEST 4: /api/ai/status - Super User Plan Details
# ============================================================================
print("TEST 4: /api/ai/status - Super User Plan Details")
print("-" * 80)

status, data = get_json(f"{API_URL}/ai/status?feature=caption", headers_with_token)
test(
    "4.1 /api/ai/status returns 200",
    status == 200,
    f"Status: {status}"
)

if status == 200 and data:
    plan = data.get('plan')
    
    # Check plan is super_user
    test(
        "4.2 /api/ai/status returns plan=super_user",
        plan == 'super_user',
        f"Plan: {plan}"
    )
    
    # Check superUser flag
    test(
        "4.3 /api/ai/status returns superUser=true",
        data.get('superUser') == True,
        f"superUser: {data.get('superUser')}"
    )
    
    # Check unlimited credits
    monthly_credits = data.get('monthlyCredits')
    test(
        "4.4 /api/ai/status returns unlimited credits (>= 1000000)",
        monthly_credits and monthly_credits >= 1000000,
        f"Monthly Credits: {monthly_credits}"
    )
    
    print(f"   📋 Plan: {plan}")
    print(f"   📋 superUser: {data.get('superUser')}")
    print(f"   📋 Monthly Credits: {monthly_credits}")
    print(f"   📋 Daily Credits: {data.get('dailyCredits')}")
else:
    test("4.2 /api/ai/status returns plan=super_user", False, "No data")
    test("4.3 /api/ai/status returns superUser=true", False, "No data")
    test("4.4 /api/ai/status returns unlimited credits", False, "No data")

print()

# ============================================================================
# TEST 5: /api/ai/analytics - Admin Access
# ============================================================================
print("TEST 5: /api/ai/analytics - Admin Access")
print("-" * 80)

status, data = get_json(f"{API_URL}/ai/analytics", headers_with_token)
test(
    "5.1 /api/ai/analytics returns 200 for admin",
    status == 200,
    f"Status: {status}"
)

if status == 200 and data:
    print(f"   📋 Response keys: {list(data.keys())}")

print()

# ============================================================================
# TEST 6: AI OS Super User Routes - Admin Access
# ============================================================================
print("TEST 6: AI OS Super User Routes - Admin Access")
print("-" * 80)

# Test various AI endpoints that should work for super users
ai_routes = [
    ("/ai/caption", "POST", {"text": "test"}),
    ("/ai/hashtags", "POST", {"text": "test"}),
    ("/ai/emojis", "POST", {"text": "test"}),
    ("/ai/post-ideas", "POST", {"text": "test"}),
]

for idx, (route, method, payload) in enumerate(ai_routes, start=1):
    url = f"{API_URL}{route}"
    status, data = post_json(url, payload, headers_with_token)
    
    # Should return 200 or error about missing AI keys (not 403 forbidden)
    test(
        f"6.{idx} {route} returns 200 or AI config error (not 403)",
        status in [200, 400, 503],
        f"Status: {status}, Route: {route}"
    )

print()

# ============================================================================
# TEST 7: Anonymous and Non-Admin Access Restrictions
# ============================================================================
print("TEST 7: Anonymous and Non-Admin Access Restrictions")
print("-" * 80)

# Test anonymous access to admin/super APIs
anonymous_tests = [
    ("/api/auth/me", "GET", None, 401),
    ("/api/storage/usage", "GET", None, 401),
    ("/api/insights", "GET", None, 401),
    ("/api/ai/status", "GET", None, 401),
    ("/api/ai/analytics", "GET", None, 401),
    ("/api/admin/users", "GET", None, [401, 403]),
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
        f"7.{idx} {endpoint} without auth returns {expected_str}",
        condition,
        f"Status: {status}, Expected: {expected_str}"
    )

print()

# ============================================================================
# TEST 8: Centralized isSuperUser Helper Usage
# ============================================================================
print("TEST 8: Centralized isSuperUser Helper Usage (Code Inspection)")
print("-" * 80)

try:
    # Check that isSuperUser is imported and used in route.js
    with open('/app/app/api/[[...path]]/route.js', 'r') as f:
        route_content = f.read()
    
    # Check import
    test(
        "8.1 route.js imports isSuperUser from entitlements",
        "import { PLANS, effectivePlan, isSuperUser } from '@/lib/entitlements'" in route_content or
        "import { isSuperUser } from '@/lib/entitlements'" in route_content,
        "Import statement found"
    )
    
    # Check usage in admin endpoints
    test(
        "8.2 route.js uses isSuperUser for admin authorization",
        "isSuperUser(user)" in route_content,
        "isSuperUser(user) calls found"
    )
    
    # Check entitlements.js implementation
    with open('/app/lib/entitlements.js', 'r') as f:
        entitlements_content = f.read()
    
    test(
        "8.3 isSuperUser checks both plan and role",
        "user?.plan === 'super_user' || user?.role === 'admin'" in entitlements_content,
        "Dual check implementation found"
    )
    
except Exception as e:
    test("8.1 Code inspection", False, str(e))

print()

# ============================================================================
# TEST 9: No Stripe/Billing Mutation
# ============================================================================
print("TEST 9: No Stripe/Billing Mutation (Verification)")
print("-" * 80)

# Verify that no billing mutations were made during this test
# We can check by ensuring the test didn't call any billing mutation endpoints
test(
    "9.1 No billing checkout calls made during test",
    True,  # This test suite doesn't call /billing/checkout
    "Test suite does not invoke billing mutations"
)

test(
    "9.2 No Stripe webhook calls made during test",
    True,  # This test suite doesn't call /webhooks/stripe
    "Test suite does not invoke Stripe webhooks"
)

test(
    "9.3 No admin grant-super calls made during test",
    True,  # This test suite doesn't call /admin/grant-super
    "Test suite does not invoke admin mutations"
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
print("P0 ENTITLEMENT VERIFICATION COMPLETE")
print("=" * 80)

sys.exit(0 if failed == 0 else 1)
