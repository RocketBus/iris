#!/usr/bin/env python3
"""
Complete JWT test script - generates and validates tokens
Tests the full JWT flow for microservices authentication
"""

import jwt
import os
import sys
import json
from datetime import datetime, timedelta

# Configuration - must match Next.js app
JWT_SECRET = os.getenv('JWT_SECRET', 'your-jwt-secret-key-min-32-characters-long')
JWT_ISSUER = os.getenv('JWT_ISSUER', 'iris')
JWT_AUDIENCE = os.getenv('JWT_AUDIENCE', 'microservices')

def generate_test_token():
    """Generate a test token for validation"""
    payload = {
        'userId': 'test-user-id-123',
        'email': 'test@example.com',
        'organizationId': 'test-org-id-456',
        'organizationSlug': 'test-org',
        'role': 'owner',
        'permissions': [
            {'resource': 'organization', 'action': 'read'},
            {'resource': 'organization', 'action': 'update'},
            {'resource': 'users', 'action': 'read'},
            {'resource': 'users', 'action': 'create'},
        ],
        'iss': JWT_ISSUER,
        'aud': JWT_AUDIENCE,
        'iat': datetime.utcnow(),
        'exp': datetime.utcnow() + timedelta(hours=1),
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
    return token

def validate_token(token):
    """Validate JWT token and return payload"""
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=['HS256'],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE
        )
        return payload
    except jwt.ExpiredSignatureError:
        print("❌ Token expired")
        return None
    except jwt.InvalidIssuerError:
        print(f"❌ Invalid issuer. Expected: {JWT_ISSUER}")
        return None
    except jwt.InvalidAudienceError:
        print(f"❌ Invalid audience. Expected: {JWT_AUDIENCE}")
        return None
    except jwt.InvalidTokenError as e:
        print(f"❌ Invalid token: {str(e)}")
        return None

def main():
    print("=" * 70)
    print("JWT Validation Test - Complete Flow")
    print("=" * 70)
    print()
    
    # Check if JWT_SECRET is set
    if JWT_SECRET == 'your-jwt-secret-key-min-32-characters-long':
        print("⚠️  WARNING: JWT_SECRET not configured!")
        print("   Set JWT_SECRET environment variable to test with real tokens")
        print()
        print("   For this test, using default secret (will only work with test tokens)")
        print()
    
    # Check command line arguments
    if len(sys.argv) > 1 and sys.argv[1] == '--generate':
        # Generate and validate test token
        print("Generating test token...")
        print("-" * 70)
        token = generate_test_token()
        print(f"✅ Test token generated: {token[:50]}...")
        print()
        print("Validating test token...")
        print("-" * 70)
        payload = validate_token(token)
        
        if payload:
            print("✅ Token validation successful!")
            print()
            print("Token Payload:")
            print(json.dumps(payload, indent=2, default=str))
            print()
            print("=" * 70)
            print("✅ Hello World - JWT generation and validation working!")
            print("=" * 70)
        else:
            print("❌ Token validation failed")
            sys.exit(1)
    else:
        # Validate provided token
        if len(sys.argv) < 2:
            print("Usage:")
            print("  python scripts/test-jwt-full.py --generate          # Generate and test token")
            print("  python scripts/test-jwt-full.py <token>             # Validate provided token")
            print()
            print("Example:")
            print("  python scripts/test-jwt-full.py --generate")
            print("  python scripts/test-jwt-full.py 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'")
            print()
            sys.exit(1)
        
        token = sys.argv[1]
        
        print("Configuration:")
        print(f"  JWT_SECRET: {'*' * 20}...{JWT_SECRET[-8:] if len(JWT_SECRET) > 8 else '***'}")
        print(f"  JWT_ISSUER: {JWT_ISSUER}")
        print(f"  JWT_AUDIENCE: {JWT_AUDIENCE}")
        print()
        print("Validating token...")
        print("-" * 70)
        
        payload = validate_token(token)
        
        if payload:
            print("✅ Token is valid!")
            print()
            print("Token Payload:")
            print("-" * 70)
            print(json.dumps(payload, indent=2, default=str))
            print()
            print("Extracted Information:")
            print("-" * 70)
            print(f"  User ID: {payload.get('userId')}")
            print(f"  Email: {payload.get('email')}")
            print(f"  Organization ID: {payload.get('organizationId')}")
            print(f"  Organization Slug: {payload.get('organizationSlug')}")
            print(f"  Role: {payload.get('role')}")
            print(f"  Permissions: {len(payload.get('permissions', []))} permissions")
            print()
            
            # Show permissions
            if payload.get('permissions'):
                print("Permissions:")
                for perm in payload['permissions']:
                    print(f"  - {perm.get('resource')}.{perm.get('action')}")
                print()
            
            # Show expiration
            exp = payload.get('exp')
            if exp:
                if isinstance(exp, (int, float)):
                    exp_date = datetime.fromtimestamp(exp)
                else:
                    exp_date = exp
                now = datetime.utcnow()
                remaining = exp_date - now
                print(f"  Expires: {exp_date.strftime('%Y-%m-%d %H:%M:%S')} UTC")
                print(f"  Time remaining: {remaining}")
                print()
            
            print("=" * 70)
            print("✅ Hello World - JWT validation working correctly!")
            print("=" * 70)
        else:
            print("=" * 70)
            print("❌ Token validation failed")
            print("=" * 70)
            sys.exit(1)

if __name__ == '__main__':
    main()

