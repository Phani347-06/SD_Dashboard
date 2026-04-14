-- Migration: Add created_at to class_sessions for accurate temporal ordering
ALTER TABLE public.class_sessions 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Also ensure temp_qr_sessions has created_at if not already present
ALTER TABLE public.temp_qr_sessions 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
