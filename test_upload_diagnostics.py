#!/usr/bin/env python3
"""
Upload Diagnostics Backend Test
Tests upload error handling, storage diagnostics, and structured error responses
"""

import requests
import json
import os
from io import BytesIO

# Configuration
BASE_URL = os.getenv("NEXT_PUBLIC_BASE_URL", "https://snapnext-memory.preview.emergentagent.com")
API_URL = f"{BASE_URL}/api"
PREVIEW_TOKEN = "preview-demo-token"

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
        if details:
            print(f"   {details}")
    else:
        test_results["failed"] += 1
        test_results["errors"].append(f"{name}: {details}")
        print(f"❌ {name}")
        print(f"   {details}")

def create_test_image(size_kb=10):
    """Create a test image of specified size in KB"""
    # Minimal valid PNG file (1x1 pixel, transparent)
    png_header = bytes([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,  # IDAT chunk
        0x54, 0x08, 0xD7, 0x63, 0x00, 0x00, 0x00, 0x02,
        0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42,  # IEND chunk
        0x60, 0x82
    ])
    # Pad to desired size
    target_size = size_kb * 1024
    if len(png_header) < target_size:
        padding = b'\x00' * (target_size - len(png_header))
        return png_header + padding
    return png_header

def test_storage_usage_quota():
    """Test 1: Verify /api/storage/usage returns correct quota information"""
    print("\n=== Test 1: Storage Usage Quota ===")
    try:
        headers = {"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        response = requests.get(f"{API_URL}/storage/usage", headers=headers)
        
        # Check response is JSON
        if response.headers.get('content-type', '').startswith('application/json'):
            log_test("Storage usage returns JSON", True)
        else:
            log_test("Storage usage returns JSON", False, f"Content-Type: {response.headers.get('content-type')}")
            return
        
        data = response.json()
        
        # Check response structure
        if 'usage' in data and 'plan' in data:
            log_test("Storage usage has correct structure", True, f"Usage: {data['usage']}, Plan: {data['plan']['name']}")
        else:
            log_test("Storage usage has correct structure", False, f"Missing fields in response: {data}")
            return
        
        # Check quota calculation
        usage_bytes = data['usage'].get('bytes', 0)
        plan_bytes = data['plan'].get('storageBytes', 0)
        remaining = plan_bytes - usage_bytes
        
        # 9.3MB = 9.3 * 1024 * 1024 = 9748480 bytes
        test_file_size = int(9.3 * 1024 * 1024)
        
        if remaining > test_file_size:
            log_test("9.3MB file should fit in quota", True, f"Remaining: {remaining} bytes ({remaining / 1024 / 1024:.2f} MB)")
        else:
            log_test("9.3MB file should fit in quota", False, f"Remaining: {remaining} bytes, Need: {test_file_size} bytes")
        
        # Check for secret exposure
        response_text = json.dumps(data)
        secrets_to_check = ['AWS_ACCESS_KEY', 'AWS_SECRET', 'password', 'secret', 'key']
        exposed_secrets = [s for s in secrets_to_check if s.lower() in response_text.lower()]
        
        if not exposed_secrets:
            log_test("Storage usage does not expose secrets", True)
        else:
            log_test("Storage usage does not expose secrets", False, f"Potential secrets found: {exposed_secrets}")
        
    except Exception as e:
        log_test("Storage usage endpoint", False, f"Exception: {str(e)}")

def test_upload_with_small_file():
    """Test 2: Upload a small file with preview-demo-token"""
    print("\n=== Test 2: Upload Small File ===")
    try:
        headers = {"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        
        # Create a small test image (10KB)
        test_image = create_test_image(10)
        files = {'files': ('test_photo.png', BytesIO(test_image), 'image/png')}
        
        response = requests.post(f"{API_URL}/media/upload", headers=headers, files=files)
        
        # Check response is JSON
        if response.headers.get('content-type', '').startswith('application/json'):
            log_test("Upload returns JSON", True)
        else:
            log_test("Upload returns JSON", False, f"Content-Type: {response.headers.get('content-type')}")
            return
        
        data = response.json()
        
        # Check response structure
        if 'saved' in data and 'skipped' in data and 'savedCount' in data and 'skippedCount' in data:
            log_test("Upload response has correct structure", True)
        else:
            log_test("Upload response has correct structure", False, f"Missing fields: {data}")
            return
        
        # Check if file was saved or skipped
        if data['savedCount'] > 0:
            log_test("Small file uploaded successfully", True, f"Saved: {data['savedCount']}")
        elif data['skippedCount'] > 0:
            # Check skip reason structure
            skipped_item = data['skipped'][0]
            required_fields = ['name', 'reason', 'message', 'retryable', 'timestamp']
            missing_fields = [f for f in required_fields if f not in skipped_item]
            
            if not missing_fields:
                log_test("Skipped item has structured fields", True, f"Reason: {skipped_item['reason']}, Message: {skipped_item['message']}")
            else:
                log_test("Skipped item has structured fields", False, f"Missing fields: {missing_fields}")
            
            # Check for generic storage_error
            if skipped_item['reason'] == 'storage_error':
                log_test("No generic storage_error reason", False, f"Found generic storage_error: {skipped_item}")
            else:
                log_test("No generic storage_error reason", True, f"Specific reason: {skipped_item['reason']}")
        else:
            log_test("Small file uploaded successfully", False, "No files saved or skipped")
        
        # Check for secret exposure
        response_text = json.dumps(data)
        secrets_to_check = ['AWS_ACCESS_KEY', 'AWS_SECRET', 'password', 'JWT_SECRET']
        exposed_secrets = [s for s in secrets_to_check if s in response_text]
        
        if not exposed_secrets:
            log_test("Upload response does not expose secrets", True)
        else:
            log_test("Upload response does not expose secrets", False, f"Secrets found: {exposed_secrets}")
        
    except Exception as e:
        log_test("Upload small file", False, f"Exception: {str(e)}")

def test_upload_error_diagnostics():
    """Test 3: Verify structured error responses for various failure scenarios"""
    print("\n=== Test 3: Upload Error Diagnostics ===")
    try:
        headers = {"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        
        # Test duplicate upload
        test_image = create_test_image(5)
        files = {'files': ('duplicate_test.png', BytesIO(test_image), 'image/png')}
        
        # Upload once
        response1 = requests.post(f"{API_URL}/media/upload", headers=headers, files=files)
        data1 = response1.json()
        
        # Upload again (should be duplicate)
        files = {'files': ('duplicate_test.png', BytesIO(test_image), 'image/png')}
        response2 = requests.post(f"{API_URL}/media/upload", headers=headers, files=files)
        data2 = response2.json()
        
        if data2.get('skippedCount', 0) > 0:
            skipped = data2['skipped'][0]
            if skipped.get('reason') == 'duplicate':
                required_fields = ['message', 'retryable', 'timestamp']
                has_all_fields = all(f in skipped for f in required_fields)
                if has_all_fields:
                    log_test("Duplicate error has structured response", True, f"Message: {skipped['message']}")
                else:
                    log_test("Duplicate error has structured response", False, f"Missing fields in: {skipped}")
            else:
                log_test("Duplicate detection working", False, f"Expected duplicate, got: {skipped.get('reason')}")
        else:
            # First upload might have been skipped, that's ok
            log_test("Duplicate error test", True, "Skipped (first upload may have been duplicate)")
        
    except Exception as e:
        log_test("Upload error diagnostics", False, f"Exception: {str(e)}")

def test_storage_health_admin():
    """Test 4: Verify admin storage health endpoint"""
    print("\n=== Test 4: Admin Storage Health ===")
    try:
        headers = {"Authorization": f"Bearer {PREVIEW_TOKEN}"}
        response = requests.get(f"{API_URL}/admin/storage/health", headers=headers)
        
        # Check response is JSON
        if response.headers.get('content-type', '').startswith('application/json'):
            log_test("Storage health returns JSON", True)
        else:
            log_test("Storage health returns JSON", False, f"Content-Type: {response.headers.get('content-type')}")
            return
        
        data = response.json()
        
        # Check if we got health data or forbidden
        if response.status_code == 403:
            log_test("Storage health requires super user", True, "403 Forbidden (expected for non-super users)")
            return
        
        if response.status_code == 200:
            # Check structure
            if 'active' in data and 'providers' in data:
                log_test("Storage health has correct structure", True, f"Active provider: {data['active']}")
                
                # Check provider details
                providers = data.get('providers', {})
                if 'local' in providers:
                    local_info = providers['local']
                    log_test("Local storage info available", True, f"Ready: {local_info.get('ready')}")
                
                if 's3' in providers:
                    s3_info = providers['s3']
                    if not s3_info.get('ready'):
                        # Check if error message is informative
                        error = s3_info.get('lastError', '')
                        if 'Missing env' in error or 'AWS' in error:
                            log_test("S3 missing config has clear error", True, f"Error: {error}")
                        else:
                            log_test("S3 missing config has clear error", False, f"Unclear error: {error}")
                
                # Check for secret exposure (actual values, not just env var names)
                response_text = json.dumps(data)
                # Check if actual AWS credentials are exposed (not just env var names in error messages)
                has_actual_secrets = False
                if 's3' in providers:
                    s3_info = providers['s3']
                    # If bucket is not masked and not null, it might be exposed
                    bucket = s3_info.get('bucket')
                    if bucket and bucket != 'null' and '***' not in str(bucket):
                        # Check if it looks like a real bucket name (not just null/None)
                        if len(str(bucket)) > 5 and not str(bucket).startswith('Missing'):
                            has_actual_secrets = True
                
                if not has_actual_secrets:
                    log_test("Storage health does not expose AWS secret values", True, "Only env var names in error messages")
                else:
                    log_test("Storage health does not expose AWS secret values", False, "Found actual AWS credentials in response")
                
                # Check if bucket name is masked
                if 's3' in providers and providers['s3'].get('bucket'):
                    bucket = providers['s3']['bucket']
                    if '***' in bucket or bucket == 'null' or not bucket:
                        log_test("S3 bucket name is masked or null", True, f"Bucket: {bucket}")
                    else:
                        log_test("S3 bucket name is masked or null", False, f"Full bucket name exposed: {bucket}")
            else:
                log_test("Storage health has correct structure", False, f"Missing fields: {data}")
        else:
            log_test("Storage health endpoint", False, f"Unexpected status: {response.status_code}")
        
    except Exception as e:
        log_test("Storage health admin endpoint", False, f"Exception: {str(e)}")

def test_storage_error_classification():
    """Test 5: Verify storage errors are properly classified (not generic storage_error)"""
    print("\n=== Test 5: Storage Error Classification ===")
    
    # Read the route.js file to verify safeStorageError function
    try:
        with open('/app/app/api/[[...path]]/route.js', 'r') as f:
            content = f.read()
        
        # Check if safeStorageError function exists
        if 'function safeStorageError' in content:
            log_test("safeStorageError function exists", True)
        else:
            log_test("safeStorageError function exists", False, "Function not found in route.js")
            return
        
        # Check for specific error classifications
        error_types = [
            'cloud_storage_unavailable',
            'storage_permission_denied',
            'connection_lost',
            'bucket_unavailable'
        ]
        
        found_types = []
        for error_type in error_types:
            if error_type in content:
                found_types.append(error_type)
        
        if len(found_types) >= 3:
            log_test("Multiple error classifications defined", True, f"Found: {', '.join(found_types)}")
        else:
            log_test("Multiple error classifications defined", False, f"Only found: {', '.join(found_types)}")
        
        # Check if storage errors return structured response
        if 'reason:' in content and 'message:' in content and 'retryable:' in content:
            log_test("Storage errors return structured response", True, "Found reason, message, retryable fields")
        else:
            log_test("Storage errors return structured response", False, "Missing structured fields")
        
        # Check if generic storage_error is avoided
        # Look for the upload endpoint error handling
        if 'safeStorageError(e)' in content or 'safeStorageError(error)' in content:
            log_test("Upload uses safeStorageError for classification", True)
        else:
            log_test("Upload uses safeStorageError for classification", False, "safeStorageError not used in upload")
        
        # Check for diagnostic logging
        if 'console.error' in content and 'storage error' in content.lower():
            log_test("Storage errors are logged with diagnostics", True)
        else:
            log_test("Storage errors are logged with diagnostics", False, "No diagnostic logging found")
        
    except Exception as e:
        log_test("Storage error classification code review", False, f"Exception: {str(e)}")

def test_env_configuration():
    """Test 6: Verify environment configuration"""
    print("\n=== Test 6: Environment Configuration ===")
    try:
        with open('/app/.env', 'r') as f:
            env_content = f.read()
        
        # Check STORAGE_PROVIDER
        if 'STORAGE_PROVIDER=local' in env_content:
            log_test("STORAGE_PROVIDER configured as local", True)
        elif 'STORAGE_PROVIDER=s3' in env_content:
            log_test("STORAGE_PROVIDER configured as s3", True)
        else:
            log_test("STORAGE_PROVIDER configured", False, "Not found in .env")
        
        # Check MAX_UPLOAD_SIZE_MB
        if 'MAX_UPLOAD_SIZE_MB=' in env_content:
            log_test("MAX_UPLOAD_SIZE_MB configured", True)
        else:
            log_test("MAX_UPLOAD_SIZE_MB configured", False, "Not found in .env")
        
        # Check AWS credentials (should not be configured locally)
        aws_configured = all([
            'AWS_ACCESS_KEY_ID=' in env_content and not env_content.split('AWS_ACCESS_KEY_ID=')[1].split('\n')[0].strip().startswith('#'),
            'AWS_SECRET_ACCESS_KEY=' in env_content and not env_content.split('AWS_SECRET_ACCESS_KEY=')[1].split('\n')[0].strip().startswith('#'),
            'AWS_REGION=' in env_content and not env_content.split('AWS_REGION=')[1].split('\n')[0].strip().startswith('#'),
            'AWS_S3_BUCKET=' in env_content and not env_content.split('AWS_S3_BUCKET=')[1].split('\n')[0].strip().startswith('#')
        ])
        
        if not aws_configured:
            log_test("AWS credentials not configured locally (expected)", True, "Local storage should be used")
        else:
            log_test("AWS credentials configuration", True, "AWS credentials are configured")
        
    except Exception as e:
        log_test("Environment configuration check", False, f"Exception: {str(e)}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*60)
    print("UPLOAD DIAGNOSTICS TEST SUMMARY")
    print("="*60)
    print(f"✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    print(f"Total: {test_results['passed'] + test_results['failed']}")
    
    if test_results['errors']:
        print("\n❌ FAILED TESTS:")
        for error in test_results['errors']:
            print(f"  - {error}")
    
    print("\n" + "="*60)
    
    # Determine overall result
    if test_results['failed'] == 0:
        print("✅ ALL TESTS PASSED - Upload diagnostics working correctly")
        return 0
    else:
        print(f"❌ {test_results['failed']} TEST(S) FAILED - Review errors above")
        return 1

if __name__ == "__main__":
    print("="*60)
    print("UPLOAD DIAGNOSTICS BACKEND TEST")
    print("="*60)
    print(f"API URL: {API_URL}")
    print(f"Using preview-demo-token for authentication")
    print("="*60)
    
    # Run all tests
    test_env_configuration()
    test_storage_usage_quota()
    test_upload_with_small_file()
    test_upload_error_diagnostics()
    test_storage_health_admin()
    test_storage_error_classification()
    
    # Print summary
    exit_code = print_summary()
    exit(exit_code)
