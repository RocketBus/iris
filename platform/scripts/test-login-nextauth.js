const { signIn } = require('next-auth/react');

async function testLogin() {
  console.log('🧪 Testing Login System');
  console.log('======================');
  
  // Test unverified user
  console.log('\n1. Testing unverified user login...');
  try {
    const result = await signIn('credentials', {
      email: 'unverified@example.com',
      password: '#Unverified123',
      redirect: false
    });
    
    console.log('Result:', result);
    
    if (result?.error) {
      console.log('Error:', result.error);
      if (result.error.includes('EmailNotVerified') || result.error.includes('verify your email')) {
        console.log('✅ Correctly detected unverified email');
      } else {
        console.log('❌ Wrong error message for unverified email');
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  // Test verified user
  console.log('\n2. Testing verified user login...');
  try {
    const result = await signIn('credentials', {
      email: 'verified@example.com',
      password: '#Verified123',
      redirect: false
    });
    
    console.log('Result:', result);
    
    if (result?.ok) {
      console.log('✅ Successfully logged in verified user');
    } else {
      console.log('❌ Failed to login verified user');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testLogin();
