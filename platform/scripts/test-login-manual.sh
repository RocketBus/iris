#!/bin/bash

echo "🧪 Testing Login System"
echo "======================"

echo "1. Testing unverified user login..."
echo "   Email: unverified@example.com"
echo "   Password: #Unverified123"
echo ""
echo "   Expected: Should show 'Please verify your email' message with resend button"
echo ""

echo "2. Testing verified user login..."
echo "   Email: verified@example.com" 
echo "   Password: #Verified123"
echo ""
echo "   Expected: Should redirect to setup page"
echo ""

echo "3. Testing invalid credentials..."
echo "   Email: invalid@example.com"
echo "   Password: wrongpassword"
echo ""
echo "   Expected: Should show 'Invalid email or password' message"
echo ""

echo "🌐 Open http://localhost:3000/login in your browser to test"
echo "📊 Check browser console for debug logs"
echo "🔍 Look for 'Login result:' and 'Login error:' messages"
