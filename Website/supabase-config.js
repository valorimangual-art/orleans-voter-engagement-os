// Shared Supabase connection — safe to be public, protected by Row Level Security policies
const SUPABASE_URL = 'https://gbxqxhfyrqpoqxrcglhq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PjWQ4a1-CSvFvGUtJY5ewg_fcggY4su';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

