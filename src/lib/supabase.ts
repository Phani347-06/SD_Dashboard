import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

// Retrieve variables from .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 🌐 Universal Browser Client (Synchronizes with Cookies)
export const supabase = createBrowserClient(supabaseUrl, supabaseKey);

// 🛡️ Institutional Admin Client (Bypasses RLS - FOR SERVER SIDE ONLY)
export const supabaseAdmin = serviceRoleKey 
  ? createClient(supabaseUrl, serviceRoleKey)
  : null as any; 
