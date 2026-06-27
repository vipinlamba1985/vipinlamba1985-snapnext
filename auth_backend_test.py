#!/usr/bin/env python3
"""
SnapNext Supabase Auth Backend Test Suite
Tests auth endpoints with focus on JSON responses and proper error handling
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3000/api"

def test_result(name, passed, details=""):
    """Print test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"   {details}")
    return passed

def is_json_response(response):
    """Check if response is valid JSON"""
    try:
        response.json()
        return True
    except:
        return False

def test_auth_config():
    """Test 1: /api/auth/config returns JSON and reports config safely"""
    print("\n=== Test 1: Auth Config ===")
    try:
        resp = requests.get(f"{BASE_URL}/auth/config", timeout=10)
        
        # Check it's JSON
        if not is_json_response(resp):
            return test_result("Auth config returns JSON", False, f"Got non-JSON response: {resp.text[:200]}")
        
        data = resp.json()
        
        # Check status code
        if resp.status_code != 200:
            return test_result("Auth config status code", False, f"Expected 200, got {resp.status_code}")
        
        # Check structure
        if 'supabase' not in data or 'serviceRole' not in data:
            return test_result("Auth config structure", False, f"Missing expected fields: {data}")
        
        # Check no secrets exposed
        data_str = json.dumps(data).lower()
        if any(secret in data_str for secret in ['key', 'secret', 'password', 'token']):
            # Check if it's just the field names, not actual values
            if data.get('supabase') not in [True, False] or data.get('serviceRole') not in [True, False]:
                return test_result("Auth config no secrets", False, f"Potential secret exposure: {data}")
        
        test_result("Auth config returns JSON", True, f"supabase={data['supabase']}, serviceRole={data['serviceRole']}")
        return True
        
    except Exception as e:
        return test_result("Auth config", False, f"Exception: {str(e)}")

def test_missing_supabase_503():
    """Test 2: Missing/unconfigured Supabase returns JSON 503, not HTML 500"""
    print("\n=== Test 2: Missing Supabase Config Returns 503 JSON ===")
    
    # Test signup without Supabase
    try:
        resp = requests.post(f"{BASE_URL}/auth/signup", 
                           json={"email": "test@example.com", "password": "password123"},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Signup without Supabase returns JSON", False, 
                             f"Got non-JSON (status {resp.status_code}): {resp.text[:200]}")
        
        if resp.status_code != 503:
            return test_result("Signup without Supabase returns 503", False, 
                             f"Expected 503, got {resp.status_code}: {resp.json()}")
        
        data = resp.json()
        if 'error' not in data:
            return test_result("Signup 503 has error message", False, f"No error field: {data}")
        
        test_result("Signup without Supabase returns 503 JSON", True, f"error: {data['error']}")
        
    except Exception as e:
        return test_result("Signup without Supabase", False, f"Exception: {str(e)}")
    
    # Test login without Supabase
    try:
        resp = requests.post(f"{BASE_URL}/auth/login",
                           json={"email": "test@example.com", "password": "password123"},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Login without Supabase returns JSON", False,
                             f"Got non-JSON (status {resp.status_code}): {resp.text[:200]}")
        
        if resp.status_code != 503:
            return test_result("Login without Supabase returns 503", False,
                             f"Expected 503, got {resp.status_code}: {resp.json()}")
        
        test_result("Login without Supabase returns 503 JSON", True)
        return True
        
    except Exception as e:
        return test_result("Login without Supabase", False, f"Exception: {str(e)}")

def test_signup_validation():
    """Test 3: Signup validation - missing fields and short password"""
    print("\n=== Test 3: Signup Validation ===")
    
    # Missing email
    try:
        resp = requests.post(f"{BASE_URL}/auth/signup",
                           json={"password": "password123"},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Signup missing email returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        # Should be 400 or 503 (503 if Supabase check happens first)
        if resp.status_code not in [400, 503]:
            return test_result("Signup missing email status", False,
                             f"Expected 400 or 503, got {resp.status_code}")
        
        test_result("Signup missing email validation", True, f"Status {resp.status_code}")
        
    except Exception as e:
        return test_result("Signup missing email", False, f"Exception: {str(e)}")
    
    # Missing password
    try:
        resp = requests.post(f"{BASE_URL}/auth/signup",
                           json={"email": "test@example.com"},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Signup missing password returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        if resp.status_code not in [400, 503]:
            return test_result("Signup missing password status", False,
                             f"Expected 400 or 503, got {resp.status_code}")
        
        test_result("Signup missing password validation", True, f"Status {resp.status_code}")
        
    except Exception as e:
        return test_result("Signup missing password", False, f"Exception: {str(e)}")
    
    # Short password (less than 6 chars)
    try:
        resp = requests.post(f"{BASE_URL}/auth/signup",
                           json={"email": "test@example.com", "password": "12345"},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Signup short password returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        # Should be 400 for validation error (happens before Supabase check)
        if resp.status_code not in [400, 503]:
            return test_result("Signup short password status", False,
                             f"Expected 400 or 503, got {resp.status_code}")
        
        data = resp.json()
        test_result("Signup short password validation", True, 
                   f"Status {resp.status_code}, error: {data.get('error', 'N/A')}")
        return True
        
    except Exception as e:
        return test_result("Signup short password", False, f"Exception: {str(e)}")

def test_login_validation():
    """Test 4: Login validation - missing fields"""
    print("\n=== Test 4: Login Validation ===")
    
    # Missing email
    try:
        resp = requests.post(f"{BASE_URL}/auth/login",
                           json={"password": "password123"},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Login missing email returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        if resp.status_code not in [400, 503]:
            return test_result("Login missing email status", False,
                             f"Expected 400 or 503, got {resp.status_code}")
        
        test_result("Login missing email validation", True, f"Status {resp.status_code}")
        
    except Exception as e:
        return test_result("Login missing email", False, f"Exception: {str(e)}")
    
    # Missing password
    try:
        resp = requests.post(f"{BASE_URL}/auth/login",
                           json={"email": "test@example.com"},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Login missing password returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        if resp.status_code not in [400, 503]:
            return test_result("Login missing password status", False,
                             f"Expected 400 or 503, got {resp.status_code}")
        
        test_result("Login missing password validation", True, f"Status {resp.status_code}")
        return True
        
    except Exception as e:
        return test_result("Login missing password", False, f"Exception: {str(e)}")

def test_auth_me():
    """Test 5: /api/auth/me - no token -> 401, preview-demo-token -> 200"""
    print("\n=== Test 5: Auth Me Endpoint ===")
    
    # No token
    try:
        resp = requests.get(f"{BASE_URL}/auth/me", timeout=10)
        
        if not is_json_response(resp):
            return test_result("Auth me without token returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        if resp.status_code != 401:
            return test_result("Auth me without token returns 401", False,
                             f"Expected 401, got {resp.status_code}")
        
        data = resp.json()
        if 'error' not in data:
            return test_result("Auth me 401 has error", False, f"No error field: {data}")
        
        test_result("Auth me without token returns 401 JSON", True)
        
    except Exception as e:
        return test_result("Auth me without token", False, f"Exception: {str(e)}")
    
    # Preview demo token
    try:
        resp = requests.get(f"{BASE_URL}/auth/me",
                          headers={"Authorization": "Bearer preview-demo-token"},
                          timeout=10)
        
        if not is_json_response(resp):
            return test_result("Auth me with preview token returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        if resp.status_code != 200:
            return test_result("Auth me with preview token returns 200", False,
                             f"Expected 200, got {resp.status_code}: {resp.json()}")
        
        data = resp.json()
        if 'user' not in data:
            return test_result("Auth me preview has user", False, f"No user field: {data}")
        
        user = data['user']
        if user.get('id') != 'preview-super-user':
            return test_result("Auth me preview user ID", False, f"Expected preview-super-user, got {user.get('id')}")
        
        test_result("Auth me with preview-demo-token returns 200 JSON", True,
                   f"user: {user.get('name')} ({user.get('email')})")
        return True
        
    except Exception as e:
        return test_result("Auth me with preview token", False, f"Exception: {str(e)}")

def test_refresh_validation():
    """Test 6: /api/auth/refresh - missing refreshToken -> 400"""
    print("\n=== Test 6: Auth Refresh Validation ===")
    
    # Missing refreshToken
    try:
        resp = requests.post(f"{BASE_URL}/auth/refresh",
                           json={},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Refresh missing token returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        # Should be 400 for missing token (happens before Supabase check per code review)
        if resp.status_code not in [400, 503]:
            return test_result("Refresh missing token status", False,
                             f"Expected 400 or 503, got {resp.status_code}")
        
        data = resp.json()
        test_result("Refresh missing token validation", True,
                   f"Status {resp.status_code}, error: {data.get('error', 'N/A')}")
        return True
        
    except Exception as e:
        return test_result("Refresh missing token", False, f"Exception: {str(e)}")

def test_logout():
    """Test 7: /api/auth/logout returns ok JSON"""
    print("\n=== Test 7: Auth Logout ===")
    
    try:
        resp = requests.post(f"{BASE_URL}/auth/logout", timeout=10)
        
        if not is_json_response(resp):
            return test_result("Logout returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        if resp.status_code != 200:
            return test_result("Logout returns 200", False,
                             f"Expected 200, got {resp.status_code}")
        
        data = resp.json()
        if not data.get('ok'):
            return test_result("Logout returns ok:true", False, f"Got: {data}")
        
        test_result("Logout returns ok JSON", True)
        return True
        
    except Exception as e:
        return test_result("Logout", False, f"Exception: {str(e)}")

def test_forgot_password():
    """Test 8: /api/auth/forgot - generic response, JSON only, no account enumeration"""
    print("\n=== Test 8: Forgot Password ===")
    
    # With email
    try:
        resp = requests.post(f"{BASE_URL}/auth/forgot",
                           json={"email": "test@example.com"},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Forgot password returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        # Should be 200 with generic message, or 503 if Supabase not configured
        if resp.status_code not in [200, 503]:
            return test_result("Forgot password status", False,
                             f"Expected 200 or 503, got {resp.status_code}")
        
        data = resp.json()
        
        # Check for generic message (no account enumeration)
        if resp.status_code == 200:
            if 'ok' not in data and 'message' not in data:
                return test_result("Forgot password has response", False, f"No ok/message field: {data}")
            
            # Message should be generic
            msg = data.get('message', '')
            if 'not found' in msg.lower() or 'does not exist' in msg.lower():
                return test_result("Forgot password no enumeration", False,
                                 f"Message reveals account existence: {msg}")
        
        test_result("Forgot password generic response", True,
                   f"Status {resp.status_code}")
        
    except Exception as e:
        return test_result("Forgot password", False, f"Exception: {str(e)}")
    
    # Without email (should still return generic message)
    try:
        resp = requests.post(f"{BASE_URL}/auth/forgot",
                           json={},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Forgot password no email returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        # Should return 200 with generic message even without email
        if resp.status_code != 200:
            return test_result("Forgot password no email status", False,
                             f"Expected 200, got {resp.status_code}")
        
        test_result("Forgot password without email returns generic response", True)
        return True
        
    except Exception as e:
        return test_result("Forgot password without email", False, f"Exception: {str(e)}")

def test_reset_verify():
    """Test 9: /api/auth/reset/verify - missing token -> 400, dummy token -> ok true"""
    print("\n=== Test 9: Reset Verify ===")
    
    # Missing token
    try:
        resp = requests.get(f"{BASE_URL}/auth/reset/verify", timeout=10)
        
        if not is_json_response(resp):
            return test_result("Reset verify missing token returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        if resp.status_code != 400:
            return test_result("Reset verify missing token returns 400", False,
                             f"Expected 400, got {resp.status_code}")
        
        data = resp.json()
        if data.get('ok') != False:
            return test_result("Reset verify missing token ok=false", False, f"Got: {data}")
        
        test_result("Reset verify missing token returns 400 JSON", True)
        
    except Exception as e:
        return test_result("Reset verify missing token", False, f"Exception: {str(e)}")
    
    # Dummy token_hash (should return ok:true per design for structural validation)
    try:
        resp = requests.get(f"{BASE_URL}/auth/reset/verify?token_hash=dummy-token-123", timeout=10)
        
        if not is_json_response(resp):
            return test_result("Reset verify with token returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        if resp.status_code != 200:
            return test_result("Reset verify with token returns 200", False,
                             f"Expected 200, got {resp.status_code}: {resp.json()}")
        
        data = resp.json()
        if data.get('ok') != True:
            return test_result("Reset verify with token ok=true", False, f"Got: {data}")
        
        test_result("Reset verify with dummy token returns ok:true", True,
                   "(by design for Supabase email-token flow)")
        return True
        
    except Exception as e:
        return test_result("Reset verify with token", False, f"Exception: {str(e)}")

def test_reset_password():
    """Test 10: /api/auth/reset - validation errors"""
    print("\n=== Test 10: Reset Password Validation ===")
    
    # Missing password
    try:
        resp = requests.post(f"{BASE_URL}/auth/reset",
                           json={"token": "dummy-token"},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Reset missing password returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        if resp.status_code not in [400, 503]:
            return test_result("Reset missing password status", False,
                             f"Expected 400 or 503, got {resp.status_code}")
        
        data = resp.json()
        test_result("Reset missing password validation", True,
                   f"Status {resp.status_code}, error: {data.get('error', 'N/A')}")
        
    except Exception as e:
        return test_result("Reset missing password", False, f"Exception: {str(e)}")
    
    # Short password
    try:
        resp = requests.post(f"{BASE_URL}/auth/reset",
                           json={"token": "dummy-token", "password": "12345"},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Reset short password returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        if resp.status_code not in [400, 503]:
            return test_result("Reset short password status", False,
                             f"Expected 400 or 503, got {resp.status_code}")
        
        data = resp.json()
        test_result("Reset short password validation", True,
                   f"Status {resp.status_code}, error: {data.get('error', 'N/A')}")
        
    except Exception as e:
        return test_result("Reset short password", False, f"Exception: {str(e)}")
    
    # Missing token/session
    try:
        resp = requests.post(f"{BASE_URL}/auth/reset",
                           json={"password": "password123"},
                           timeout=10)
        
        if not is_json_response(resp):
            return test_result("Reset missing token returns JSON", False,
                             f"Got non-JSON: {resp.text[:200]}")
        
        if resp.status_code not in [400, 503]:
            return test_result("Reset missing token status", False,
                             f"Expected 400 or 503, got {resp.status_code}")
        
        data = resp.json()
        test_result("Reset missing token/session validation", True,
                   f"Status {resp.status_code}, error: {data.get('error', 'N/A')}")
        return True
        
    except Exception as e:
        return test_result("Reset missing token", False, f"Exception: {str(e)}")

def main():
    print("=" * 70)
    print("SnapNext Supabase Auth Backend Test Suite")
    print("=" * 70)
    print(f"Testing against: {BASE_URL}")
    print("Note: Supabase is not configured, expecting 503 for live auth flows")
    print("=" * 70)
    
    tests = [
        test_auth_config,
        test_missing_supabase_503,
        test_signup_validation,
        test_login_validation,
        test_auth_me,
        test_refresh_validation,
        test_logout,
        test_forgot_password,
        test_reset_verify,
        test_reset_password,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            result = test()
            if result:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ FAIL: {test.__name__} - Unexpected exception: {str(e)}")
            failed += 1
    
    print("\n" + "=" * 70)
    print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed} tests")
    print("=" * 70)
    
    if failed > 0:
        sys.exit(1)
    else:
        print("\n✅ All auth endpoint tests passed!")
        sys.exit(0)

if __name__ == "__main__":
    main()
