#!/usr/bin/env python3
"""
Temporary JWT validation test script
Tests if JWT tokens from the Iris platform can be validated correctly
"""

import jwt
import os
import sys
import json
from datetime import datetime

# Configuration
JWT_SECRET = os.getenv('JWT_SECRET', 'your-jwt-secret-key-min-32-characters-long')
JWT_ISSUER = os.getenv('JWT_ISSUER', 'iris')
JWT_AUDIENCE = os.getenv('JWT_AUDIENCE', 'microservices')

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
    print("=" * 60)
    print("JWT Validation Test - Hello World")
    print("=" * 60)
    print()
    
    # Check if JWT_SECRET is set
    if JWT_SECRET == 'your-jwt-secret-key-min-32-characters-long':
        print("⚠️  WARNING: JWT_SECRET not configured!")
        print("   Set JWT_SECRET environment variable before testing")
        print()
        print("   Example:")
        print("   export JWT_SECRET='your-actual-secret-key'")
        print("   python scripts/test-jwt.py <token>")
        print()
        sys.exit(1)
    
    # Get token from command line argument
    if len(sys.argv) < 2:
        print("Usage: python scripts/test-jwt.py <jwt_token>")
        print()
        print("Example:")
        print("  python scripts/test-jwt.py 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'")
        print()
        print("To get a token, make a POST request to /api/microservices/token")
        print("from an authenticated session in the Next.js app.")
        sys.exit(1)
    
    token = sys.argv[1]
    
    print("Configuration:")
    print(f"  JWT_SECRET: {'*' * 20}...{JWT_SECRET[-8:]}")
    print(f"  JWT_ISSUER: {JWT_ISSUER}")
    print(f"  JWT_AUDIENCE: {JWT_AUDIENCE}")
    print()
    print("Validating token...")
    print("-" * 60)
    
    payload = validate_token(token)
    
    if payload:
        print("✅ Token is valid!")
        print()
        print("Token Payload:")
        print("-" * 60)
        print(json.dumps(payload, indent=2, default=str))
        print()
        print("Extracted Information:")
        print("-" * 60)
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
            exp_date = datetime.fromtimestamp(exp)
            now = datetime.now()
            remaining = exp_date - now
            print(f"  Expires: {exp_date.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"  Time remaining: {remaining}")
            print()
        
        print("=" * 60)
        print("✅ Hello World - JWT validation working correctly!")
        print("=" * 60)
    else:
        print("=" * 60)
        print("❌ Token validation failed")
        print("=" * 60)
        sys.exit(1)

if __name__ == '__main__':
    main()

