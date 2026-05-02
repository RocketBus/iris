const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function cleanDatabase() {
  console.log('🧹 Cleaning database...');
  
  // Ler variáveis do .env.local
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const envVars = {};
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      envVars[key.trim()] = value.trim();
    }
  });
  
  const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    console.log('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Limpar tabelas relacionadas primeiro
    console.log('🗑️  Cleaning two_factor_codes...');
    const { error: error1 } = await supabase
      .from('two_factor_codes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (error1) console.log('⚠️  two_factor_codes:', error1.message);
    
    console.log('🗑️  Cleaning sessions...');
    const { error: error2 } = await supabase
      .from('sessions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (error2) console.log('⚠️  sessions:', error2.message);
    
    console.log('🗑️  Cleaning users...');
    const { error: error3 } = await supabase
      .from('users')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (error3) console.log('⚠️  users:', error3.message);
    
    // Verificar se as tabelas estão vazias
    console.log('📊 Checking table counts...');
    
    const { count: usersCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    
    const { count: sessionsCount } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true });
    
    const { count: twoFactorCount } = await supabase
      .from('two_factor_codes')
      .select('*', { count: 'exact', head: true });
    
    console.log('✅ Database cleaned successfully!');
    console.log(`📊 Users: ${usersCount}`);
    console.log(`📊 Sessions: ${sessionsCount}`);
    console.log(`📊 Two Factor Codes: ${twoFactorCount}`);
    
  } catch (error) {
    console.error('❌ Error cleaning database:', error.message);
    process.exit(1);
  }
}

cleanDatabase();