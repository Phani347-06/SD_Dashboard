-- 🛰️ VANGUARD PROTOCOL: Schema Restoration & Relationship Fix
-- Run this in your Supabase SQL Editor to ensure the Student Identity handshake works for future logging.

-- 1. Ensure the Relationship between Sessions and Students exists
-- This adds the missing Foreign Key that caused the "Could not find a relationship" error.
ALTER TABLE public.sessions 
DROP CONSTRAINT IF EXISTS fk_sessions_student;

ALTER TABLE public.sessions
ADD CONSTRAINT fk_sessions_student 
FOREIGN KEY (student_id) 
REFERENCES public.students(id) 
ON DELETE CASCADE;

-- 2. Verify and Refresh Schema Cache
-- (Note: Supabase refreshes the cache automatically when DDL changes are made)
COMMENT ON TABLE public.sessions IS 'Student security session nodes with validated identity anchors.';
