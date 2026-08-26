-- ================================================================
-- MIGRACIÓN 002: Perfiles e Identidad de Usuario (Profiles)
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  display_name VARCHAR(50) NOT NULL,
  avatar_url TEXT NULL,
  cedula_hash VARCHAR(64) NOT NULL,
  cedula_last4 VARCHAR(4) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  state_venezuela VARCHAR(50) NOT NULL,
  birth_date DATE NOT NULL,
  account_status account_status_enum NOT NULL DEFAULT 'PENDING_VERIFICATION',
  kyc_status kyc_status_enum NOT NULL DEFAULT 'UNSUBMITTED',
  is_mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Restricciones de Integridad y Cumplimiento
  CONSTRAINT uq_profiles_user_id UNIQUE (user_id),
  CONSTRAINT uq_profiles_cedula_hash UNIQUE (cedula_hash),
  CONSTRAINT chk_profiles_min_age CHECK (birth_date <= (CURRENT_DATE - INTERVAL '18 years')),
  CONSTRAINT chk_profiles_cedula_last4 CHECK (length(cedula_last4) = 4),
  CONSTRAINT chk_profiles_cedula_hash CHECK (length(cedula_hash) = 64)
);

-- Índices de Rendimiento y Búsqueda
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_cedula_hash ON public.profiles(cedula_hash);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);
CREATE INDEX IF NOT EXISTS idx_profiles_kyc_status ON public.profiles(kyc_status);

-- Activación y Forzado de Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
