import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pnhdltojsdukrgqagcml.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuaGRsdG9qc2R1a3JncWFnY21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NDY2NzIsImV4cCI6MjA5MjUyMjY3Mn0.pFfbiUWmM89EScMZ_XmVIoeCHTN9TEDcq9o9WW6pD24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default supabase;
