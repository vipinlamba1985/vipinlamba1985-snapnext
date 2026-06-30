#!/bin/bash

echo "================================================================================"
echo "SNAPNEXT AI BACKEND API TESTING - COMPREHENSIVE QA"
echo "================================================================================"
echo ""

PREVIEW_TOKEN="preview-demo-token"
BASE_URL="http://localhost:3000/api"

passed=0
failed=0

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local token="$4"
    local data="$5"
    local expected_status="$6"
    
    if [ -n "$token" ]; then
        auth_header="-H \"Authorization: Bearer $token\""
    else
        auth_header=""
    fi
    
    if [ "$method" = "POST" ] && [ -n "$data" ]; then
        response=$(eval curl -s -w "\\nHTTP_CODE:%{http_code}" -X POST $auth_header -H "Content-Type: application/json" -d "'$data'" "$BASE_URL$endpoint" 2>&1)
    else
        response=$(eval curl -s -w "\\nHTTP_CODE:%{http_code}" -X $method $auth_header "$BASE_URL$endpoint" 2>&1)
    fi
    
    http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    
    if [ "$http_code" = "$expected_status" ]; then
        echo "✅ PASS: $name (HTTP $http_code)"
        ((passed++))
    else
        echo "❌ FAIL: $name (Expected HTTP $expected_status, got $http_code)"
        ((failed++))
    fi
}

echo "================================================================================"
echo "TRACK A: ADMIN/SUPER USER TESTING (preview-demo-token)"
echo "================================================================================"
echo ""

echo "Test 1: /api/auth/me - Verify admin role and Super User access"
response=$(curl -s -H "Authorization: Bearer $PREVIEW_TOKEN" "$BASE_URL/auth/me")
email=$(echo "$response" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
role=$(echo "$response" | grep -o '"role":"[^"]*"' | cut -d'"' -f4)
plan=$(echo "$response" | grep -o '"plan":"[^"]*"' | cut -d'"' -f4)

if [ "$email" = "vipin.lamba1985@gmail.com" ]; then
    echo "✅ PASS: Email verification (vipin.lamba1985@gmail.com)"
    ((passed++))
else
    echo "❌ FAIL: Email verification (Expected vipin.lamba1985@gmail.com, got $email)"
    ((failed++))
fi

if [ "$role" = "admin" ]; then
    echo "✅ PASS: Admin role verification"
    ((passed++))
else
    echo "❌ FAIL: Admin role verification (Expected admin, got $role)"
    ((failed++))
fi

if [ "$plan" = "admin" ] || [ "$plan" = "super_user" ]; then
    echo "✅ PASS: Super User access (plan: $plan)"
    ((passed++))
else
    echo "❌ FAIL: Super User access (Expected admin or super_user, got $plan)"
    ((failed++))
fi

echo ""

test_endpoint "admin/users" "GET" "/admin/users" "$PREVIEW_TOKEN" "" "200"
test_endpoint "ai/analytics" "GET" "/ai/analytics" "$PREVIEW_TOKEN" "" "200"
test_endpoint "ai/status" "GET" "/ai/status?feature=caption" "$PREVIEW_TOKEN" "" "200"

echo ""
echo "AI-OS Endpoints:"
test_endpoint "ai-os/status GET" "GET" "/ai-os/status" "$PREVIEW_TOKEN" "" "200"
test_endpoint "ai-os/agents GET" "GET" "/ai-os/agents" "$PREVIEW_TOKEN" "" "200"
test_endpoint "ai-os/agents POST" "POST" "/ai-os/agents" "$PREVIEW_TOKEN" '{"task":"test"}' "200"
test_endpoint "ai-os/video GET" "GET" "/ai-os/video" "$PREVIEW_TOKEN" "" "200"
test_endpoint "ai-os/governance GET" "GET" "/ai-os/governance" "$PREVIEW_TOKEN" "" "200"
test_endpoint "ai-os/safety GET" "GET" "/ai-os/safety" "$PREVIEW_TOKEN" "" "200"
test_endpoint "ai-os/business GET" "GET" "/ai-os/business" "$PREVIEW_TOKEN" "" "200"
test_endpoint "ai-os/scorecards GET" "GET" "/ai-os/scorecards" "$PREVIEW_TOKEN" "" "200"
test_endpoint "ai-os/certification GET" "GET" "/ai-os/certification" "$PREVIEW_TOKEN" "" "200"
test_endpoint "ai-os/alerts GET" "GET" "/ai-os/alerts" "$PREVIEW_TOKEN" "" "200"

echo ""
echo "================================================================================"
echo "ANONYMOUS ACCESS REJECTION TESTS"
echo "================================================================================"
echo ""

test_endpoint "admin/users (anonymous)" "GET" "/admin/users" "" "" "403"
test_endpoint "admin/grant-super (anonymous)" "GET" "/admin/grant-super" "" "" "403"
test_endpoint "admin/storage/health (anonymous)" "GET" "/admin/storage/health" "" "" "403"
test_endpoint "admin/billing/health (anonymous)" "GET" "/admin/billing/health" "" "" "403"
test_endpoint "admin/emails (anonymous)" "GET" "/admin/emails" "" "" "403"
test_endpoint "ai/analytics (anonymous)" "GET" "/ai/analytics" "" "" "401"
test_endpoint "ai-os/governance (anonymous)" "GET" "/ai-os/governance" "" "" "401"

echo ""
echo "================================================================================"
echo "TRACK B: NORMAL USER TESTING"
echo "================================================================================"
echo ""

# Check Supabase configuration
echo "Checking Supabase configuration..."
response=$(curl -s "$BASE_URL/auth/config")
supabase_configured=$(echo "$response" | grep -o '"supabase":[^,}]*' | cut -d: -f2)

if [ "$supabase_configured" = "false" ]; then
    echo "❌ Supabase NOT configured (missing SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)"
    echo "🚫 TRACK B BLOCKED: Cannot create normal user without Supabase"
    echo "   - /app/memory/test_credentials.md does not exist"
    echo "   - Supabase signup/login not configured"
    ((failed++))
else
    echo "✅ Supabase is configured"
    echo "Note: Would test normal user flows if Supabase was configured"
fi

echo ""
echo "================================================================================"
echo "FINAL REPORT"
echo "================================================================================"
echo ""
echo "✅ PASSED: $passed tests"
echo "❌ FAILED: $failed tests"
echo ""

if [ $failed -eq 0 ]; then
    echo "✅ ALL TESTS PASSED"
    exit 0
else
    echo "❌ SOME TESTS FAILED"
    exit 1
fi
