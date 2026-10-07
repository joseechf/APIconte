import 'dotenv/config';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

async function testSupabaseConnection() {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const error = new Error('Faltan las credenciales de Supabase en el archivo .env.');
      error.origin = 'src/scripts/test-supabase.js:testSupabaseConnection';
      throw error;
    }

    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (!response.ok) {
      const error = new Error(`Supabase respondió con HTTP ${response.status}.`);
      error.origin = 'Supabase Auth:settings';
      throw error;
    }

    console.log('Conexión con Supabase verificada correctamente.');
  } catch (error) {
    console.error(`[${error.origin ?? 'src/scripts/test-supabase.js'}] ${error.message}`);
    process.exitCode = 1;
  }
}

await testSupabaseConnection();
