#!/usr/bin/env node

// Test script for debug environment
const { exec } = require('child_process');

console.log('🔍 Testing Debug Environment...\n');

// Test 1: Signup with debug logs
console.log('📝 Test 1: User Signup with Debug Logs');
console.log('=====================================');

const signupData = {
  name: 'Debug Test User',
  email: 'debug-test@example.com',
  password: '#DebugTest123'
};

const signupCommand = `curl -X POST http://localhost:3000/api/auth/signup -H "Content-Type: application/json" -d '${JSON.stringify(signupData)}' -s`;

exec(signupCommand, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  console.log('✅ Response:', stdout);
  console.log('📊 Check the server logs above for debug information\n');
  
  // Test 2: Login attempt (should fail due to unverified email)
  console.log('🔐 Test 2: Login Attempt (Should Fail - Unverified Email)');
  console.log('=======================================================');
  
  const loginData = {
    email: 'debug-test@example.com',
    password: '#DebugTest123'
  };
  
  const loginCommand = `curl -X POST http://localhost:3000/api/auth/signin -H "Content-Type: application/json" -d '${JSON.stringify(loginData)}' -s`;
  
  exec(loginCommand, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }
    
    console.log('✅ Response:', stdout);
    console.log('📊 Check the server logs above for debug information\n');
    
    // Test 3: Forgot password
    console.log('🔑 Test 3: Forgot Password Request');
    console.log('=================================');
    
    const forgotPasswordData = {
      email: 'debug-test@example.com'
    };
    
    const forgotPasswordCommand = `curl -X POST http://localhost:3000/api/auth/forgot-password -H "Content-Type: application/json" -d '${JSON.stringify(forgotPasswordData)}' -s`;
    
    exec(forgotPasswordCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error:', error.message);
        return;
      }
      
      console.log('✅ Response:', stdout);
      console.log('📊 Check the server logs above for debug information\n');
      
      console.log('🎉 Debug tests completed!');
      console.log('📋 Summary:');
      console.log('  - User signup with detailed logging');
      console.log('  - Login attempt with debug info');
      console.log('  - Password reset request with logs');
      console.log('\n💡 Check your server console for detailed debug logs!');
    });
  });
});
