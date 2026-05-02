const fetch = require('node-fetch');

async function testLogin() {
  console.log('🔐 Testing login with unverified user...');
  
  try {
    const response = await fetch('http://localhost:3000/api/auth/signin/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'email=unverified@example.com&password=%23Unverified123&redirect=false'
    });

    const text = await response.text();
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    console.log('Response body:', text);
    
    if (response.status === 302) {
      console.log('Redirect location:', response.headers.get('location'));
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testLogin();
