-- 🛡️ VANGUARD PROTOCOL: Data Integrity & Relationship Restoration
-- This script cleans up orphaned data before applying security constraints.

-- 1. PURGE ORPHANED SESSIONS
-- Deletes any session entries that do not have a linked student.
-- This is required to solve the ERROR 23503.
DELETE FROM public.sessions 
WHERE student_id NOT IN (SELECT id FROM public.students);

-- 2. APPLY FOREIGN KEY CONSTRAINT
-- Now that the data is clean, we can safely enforce the relationship.
ALTER TABLE public.sessions 
DROP CONSTRAINT IF EXISTS fk_sessions_student;

ALTER TABLE public.sessions
ADD CONSTRAINT fk_sessions_student 
FOREIGN KEY (student_id) 
REFERENCES public.students(id) 
ON DELETE CASCADE;

-- 3. VERIFY INTEGRITY
-- Add a comment to confirm the table is now secured and linked.
COMMENT ON TABLE public.sessions IS 'Secured student session nodes with verified Foreign Key alignment.';
