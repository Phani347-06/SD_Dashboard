-- Supabase Full Schema for LabIntelligence Secure Attendance Workflow

-- WARNING: This drops existing conflicting tables to rebuild the precise schema
DROP TABLE IF EXISTS public.attendance_logs CASCADE;
DROP TABLE IF EXISTS public.temp_qr_sessions CASCADE;
DROP TABLE IF EXISTS public.class_sessions CASCADE;
DROP TABLE IF EXISTS public.lab_students CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.labs CASCADE;
DROP TABLE IF EXISTS public.students CASCADE;

-- 1. Labs Table (Laboratory/Classroom Nodes)
CREATE TABLE public.labs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    department VARCHAR(50),
    location VARCHAR(100),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Students Table (Handles Login & Fingerprint)
CREATE TABLE public.students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY, -- Linked to auth.users.id
    roll_no VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100),
    department VARCHAR(50),
    
    -- Zero-Trust Identity Anchors
    registered_device_fingerprint VARCHAR(255),
    current_session_token UUID, -- The temp_session_id for the current login
    last_ping TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.5 Sessions Table (Student Security Session Nodes)
-- Tracks active login sessions with fingerprint binding and expiration
CREATE TABLE public.sessions (
    temp_session_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    fingerprint_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    attendance_submitted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Lab Students (Enrollment Junction Table)
CREATE TABLE public.lab_students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    lab_id UUID REFERENCES public.labs(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, lab_id)
);

-- 4. Class Sessions (Overarching Session for the Lecture/Lab)
CREATE TABLE public.class_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lab_id UUID REFERENCES public.labs(id) ON DELETE CASCADE,
    teacher_id VARCHAR(50) NOT NULL,
    course_code VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' -- 'ACTIVE' or 'ENDED'
);

-- 3. Temp Sessions / Rolling QRs (The 10-minute active token)
CREATE TABLE public.temp_qr_sessions (
    temp_session_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_session_id UUID REFERENCES public.class_sessions(id) ON DELETE CASCADE,
    verification_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- 4. Attendance Scans (The two-stage validation tracking table)
CREATE TABLE public.attendance_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    class_session_id UUID REFERENCES public.class_sessions(id) ON DELETE CASCADE,
    temp_session_id UUID REFERENCES public.temp_qr_sessions(temp_session_id) ON DELETE SET NULL,
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit Snapshots (Maintain credibility after technical purging)
    qr_code_snapshot VARCHAR(6),
    token_id_snapshot UUID,
    
    -- Workflow Booleans
    stage_1_passed BOOLEAN DEFAULT FALSE,
    stage_2_passed BOOLEAN DEFAULT FALSE,
    device_fingerprint_match BOOLEAN DEFAULT FALSE,
    
    -- Final Output 'PENDING' / 'VERIFIED' / 'FAILED'
    final_status VARCHAR(20) DEFAULT 'PENDING'
);

-- 5. Beacon Telemetry (ESP32 iBeacon Status Tracking)
CREATE TABLE public.beacon_telemetry (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    beacon_id VARCHAR(100) UNIQUE NOT NULL,  -- e.g., "beacon-lab-room-1-station-1"
    major_id INTEGER NOT NULL,                -- iBeacon Major ID (Lab Room)
    minor_id INTEGER NOT NULL,                -- iBeacon Minor ID (Station)
    uuid VARCHAR(50) NOT NULL,                -- iBeacon UUID
    status VARCHAR(20) DEFAULT 'ACTIVE',      -- 'ACTIVE' or 'INACTIVE'
    uptime_seconds BIGINT,                    -- Beacon uptime since boot
    wifi_rssi INTEGER,                        -- WiFi signal strength (dBm)
    ip_address INET,                          -- Last known IP address
    last_heartbeat TIMESTAMP WITH TIME ZONE,  -- Last received heartbeat
    raw_data JSONB,                           -- Full telemetry payload
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance optimization
CREATE INDEX idx_lab_students_student_id ON public.lab_students(student_id);
CREATE INDEX idx_lab_students_lab_id ON public.lab_students(lab_id);
CREATE INDEX idx_class_sessions_lab_id ON public.class_sessions(lab_id);
CREATE INDEX idx_class_sessions_status ON public.class_sessions(status);
CREATE INDEX idx_beacon_id ON public.beacon_telemetry(beacon_id);
CREATE INDEX idx_last_heartbeat ON public.beacon_telemetry(last_heartbeat DESC);
-- Sessions table indexes for efficient session lookup and recovery
CREATE INDEX idx_sessions_temp_session_id ON public.sessions(temp_session_id);
CREATE INDEX idx_sessions_student_id ON public.sessions(student_id);
CREATE INDEX idx_sessions_fingerprint_hash ON public.sessions(fingerprint_hash);
CREATE INDEX idx_sessions_is_active_expires ON public.sessions(is_active, expires_at DESC);
CREATE INDEX idx_sessions_student_fingerprint_active ON public.sessions(student_id, fingerprint_hash, is_active);

-- Important Security Notes:
-- Enabling Row Level Security (RLS) policies 
-- could be added here to restrict API key access based on User Auth
