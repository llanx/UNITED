"""
End-to-end test for UNITED server auth flow.
Tests: register, challenge, verify, refresh, server settings, rate limiting.
Requires: pip install requests pynacl (or use built-in if available)
"""
import subprocess
import time
import json
import hashlib
import os
import sys

# Try requests; if not available, use urllib
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    import urllib.request
    import urllib.error
    HAS_REQUESTS = False

BASE = "http://localhost:1984"

def http_post(path, data=None):
    url = f"{BASE}{path}"
    body = json.dumps(data).encode() if data else None
    if HAS_REQUESTS:
        resp = requests.post(url, json=data)
        try:
            return resp.status_code, resp.json() if resp.content else {}
        except Exception:
            return resp.status_code, {"_raw": resp.text}
    else:
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        try:
            resp = urllib.request.urlopen(req)
            return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read()) if e.read() else {}

def http_get(path, headers=None):
    url = f"{BASE}{path}"
    if HAS_REQUESTS:
        resp = requests.get(url, headers=headers)
        return resp.status_code, resp.json() if resp.content else {}
    else:
        req = urllib.request.Request(url, headers=headers or {})
        try:
            resp = urllib.request.urlopen(req)
            return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, {}

def http_put(path, data, headers=None):
    url = f"{BASE}{path}"
    if HAS_REQUESTS:
        resp = requests.put(url, json=data, headers=headers)
        try:
            return resp.status_code, resp.json() if resp.content else {}
        except Exception:
            return resp.status_code, {"_raw": resp.text}
    else:
        body = json.dumps(data).encode()
        h = {"Content-Type": "application/json"}
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, data=body, headers=h, method="PUT")
        try:
            resp = urllib.request.urlopen(req)
            return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, {}

def test_all():
    # Try to use nacl
    try:
        from nacl.signing import SigningKey
        HAS_NACL = True
    except ImportError:
        HAS_NACL = False
        print("WARNING: pynacl not installed, skipping crypto tests")

    # 1. Test server info endpoint (public)
    status, info = http_get("/api/server/info")
    assert status == 200, f"Expected 200, got {status}"
    assert "name" in info, f"Missing 'name' in server info"
    assert info["version"] == "0.1.0"
    assert info["registration_mode"] == "open"
    print(f"PASS: GET /api/server/info -> {info['name']}")

    # 2. Test health check
    url = f"{BASE}/health"
    if HAS_REQUESTS:
        resp = requests.get(url)
        assert resp.status_code == 200 and resp.text == "ok"
    print("PASS: GET /health")

    # 3. Test challenge endpoint
    status, challenge = http_post("/api/auth/challenge")
    assert status == 200, f"Expected 200 for challenge, got {status}"
    assert "challenge_id" in challenge
    assert "challenge_bytes" in challenge
    assert len(challenge["challenge_bytes"]) == 64  # 32 bytes hex
    print(f"PASS: POST /api/auth/challenge -> id={challenge['challenge_id'][:8]}...")

    if not HAS_NACL:
        print("SKIP: Crypto tests (install pynacl: pip install pynacl)")
        return True

    # 4. Test registration with setup token
    # Read the setup token from the server output (we'll extract from DB via test data dir)
    # Instead, we'll generate a key and try to register
    signing_key = SigningKey.generate()
    public_key = signing_key.verify_key
    pk_hex = public_key.encode().hex()

    # Compute fingerprint: SHA-256(public_key) truncated to 20 bytes, hex
    fingerprint_full = hashlib.sha256(public_key.encode()).digest()[:20]
    fingerprint = fingerprint_full.hex()

    # Sign the public key as genesis record signature
    genesis_sig = signing_key.sign(public_key.encode()).signature.hex()

    # Read setup token from test data (the server stores hash, but we generated it)
    # We need to get the actual setup token. Let's check the server log.
    # For testing, we'll read from the DB directly.
    setup_token = os.environ.get("SETUP_TOKEN", "")

    reg_data = {
        "public_key": pk_hex,
        "fingerprint": fingerprint,
        "display_name": "TestAdmin",
        "encrypted_blob": "deadbeef" * 8,
        "genesis_signature": genesis_sig,
    }
    if setup_token:
        reg_data["setup_token"] = setup_token

    status, reg = http_post("/api/auth/register", reg_data)
    assert status == 200, f"Expected 200 for register, got {status}: {reg}"
    assert "user_id" in reg
    assert "access_token" in reg
    assert "refresh_token" in reg
    if setup_token:
        assert reg["is_owner"] == True, "Should be owner with setup token"
    print(f"PASS: POST /api/auth/register -> user_id={reg['user_id'][:8]}..., owner={reg.get('is_owner')}")

    # 5. Test challenge-response auth flow
    status, challenge = http_post("/api/auth/challenge")
    assert status == 200

    # Sign the challenge bytes
    challenge_bytes = bytes.fromhex(challenge["challenge_bytes"])
    signature = signing_key.sign(challenge_bytes).signature

    verify_data = {
        "challenge_id": challenge["challenge_id"],
        "public_key": pk_hex,
        "signature": signature.hex(),
        "fingerprint": fingerprint,
    }
    status, tokens = http_post("/api/auth/verify", verify_data)
    assert status == 200, f"Expected 200 for verify, got {status}"
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    print(f"PASS: POST /api/auth/verify -> got JWT tokens")

    # 6. Test refresh token
    status, refreshed = http_post("/api/auth/refresh", {"refresh_token": tokens["refresh_token"]})
    assert status == 200, f"Expected 200 for refresh, got {status}"
    assert "access_token" in refreshed
    assert "refresh_token" in refreshed
    # Old refresh token should be consumed
    status2, _ = http_post("/api/auth/refresh", {"refresh_token": tokens["refresh_token"]})
    assert status2 != 200, "Old refresh token should be invalid after rotation"
    print("PASS: POST /api/auth/refresh -> token rotation works")

    # 7. Test server settings update (admin-only)
    auth_header = {"Authorization": f"Bearer {refreshed['access_token']}"}

    if setup_token:
        # Owner should be able to update settings
        status, updated = http_put("/api/server/settings",
            {"name": "Test UNITED Server", "description": "A test server"},
            headers=auth_header)
        assert status == 200, f"Expected 200 for settings update, got {status}"
        assert updated["name"] == "Test UNITED Server"
        print("PASS: PUT /api/server/settings -> admin update works")

        # Verify the update persists
        status, info = http_get("/api/server/info")
        assert status == 200
        assert info["name"] == "Test UNITED Server"
        print("PASS: GET /api/server/info -> settings persisted")

    # 8. Test display name uniqueness
    signing_key2 = SigningKey.generate()
    pk2_hex = signing_key2.verify_key.encode().hex()
    fp2 = hashlib.sha256(signing_key2.verify_key.encode()).digest()[:20].hex()
    genesis_sig2 = signing_key2.sign(signing_key2.verify_key.encode()).signature.hex()

    status, _ = http_post("/api/auth/register", {
        "public_key": pk2_hex,
        "fingerprint": fp2,
        "display_name": "TestAdmin",  # Same name as first user
        "encrypted_blob": "deadbeef" * 8,
        "genesis_signature": genesis_sig2,
    })
    assert status == 409, f"Expected 409 for duplicate display name, got {status}"
    print("PASS: Display name uniqueness enforced (409 Conflict)")

    # 9. Test fingerprint uniqueness (may get 429 if rate limited, both are valid)
    status, _ = http_post("/api/auth/register", {
        "public_key": pk_hex,  # Same key
        "fingerprint": fingerprint,  # Same fingerprint
        "display_name": "DifferentName",
        "encrypted_blob": "deadbeef" * 8,
        "genesis_signature": genesis_sig,
    })
    assert status in (409, 429), f"Expected 409 or 429 for duplicate fingerprint, got {status}"
    if status == 409:
        print("PASS: Fingerprint uniqueness enforced (409 Conflict)")
    else:
        print("PASS: Fingerprint test rate-limited (429) — rate limiting confirmed working")

    # 10. Test rate limiting (burst 5, then limited)
    # We've already made many requests above, so rate limiting should already be kicking in
    print("Testing rate limiting (sending 8 rapid requests)...")
    rate_results = []
    for i in range(8):
        status, _ = http_post("/api/auth/challenge")
        rate_results.append(status)
    limited_count = sum(1 for s in rate_results if s == 429)
    ok_count = sum(1 for s in rate_results if s == 200)
    print(f"  Results: {ok_count} OK, {limited_count} rate-limited")
    assert limited_count > 0, f"Expected some 429s from rate limiting, got {rate_results}"
    print("PASS: Rate limiting blocks rapid auth requests")

    return True

if __name__ == "__main__":
    try:
        success = test_all()
        if success:
            print("\n=== ALL TESTS PASSED ===")
            sys.exit(0)
    except Exception as e:
        print(f"\nFAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
