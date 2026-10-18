import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Pool } = pg;

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const error = new Error(
    'Faltan SUPABASE_URL o SUPABASE_ANON_KEY. Crea un archivo .env usando .env.example.'
  );
  error.origin = 'src/config/supabase.js';
  throw error;
}

class SupabaseConnection {
  static publicClient;
  static adminClient;

  static getPublicClient() {
    if (!SupabaseConnection.publicClient) {
      SupabaseConnection.publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    }

    return SupabaseConnection.publicClient;
  }

  static getAdminClient() {
    const { SUPABASE_SERVICE_ROLE_KEY } = process.env;

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      const error = new Error(
        'Falta SUPABASE_SERVICE_ROLE_KEY para realizar esta operación administrativa.'
      );
      error.statusCode = 503;
      error.origin = 'src/config/supabase.js:getAdminClient';
      throw error;
    }

    if (!SupabaseConnection.adminClient) {
      SupabaseConnection.adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    }

    return SupabaseConnection.adminClient;
  }
}

class PostgresConnection {
  static pool;

  static getPool() {
    const { SUPABASE_DB_URL } = process.env;

    if (!SUPABASE_DB_URL) {
      const error = new Error(
        'Falta SUPABASE_DB_URL para realizar transacciones PostgreSQL.'
      );
      error.statusCode = 503;
      error.origin = 'src/config/supabase.js:getPool';
      throw error;
    }

    if (!PostgresConnection.pool) {
      PostgresConnection.pool = new Pool({
        connectionString: SUPABASE_DB_URL
      });
    }

    return PostgresConnection.pool;
  }
}

export const supabase = SupabaseConnection.getPublicClient();

export function getSupabaseAdminClient() {
  return SupabaseConnection.getAdminClient();
}

export function getPostgresPool() {
  return PostgresConnection.getPool();
}
