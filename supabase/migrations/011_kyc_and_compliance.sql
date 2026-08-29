-- ================================================================
-- MIGRACIÓN 011: Expedientes KYC y Cumplimiento Regulatorio
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.kyc_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  document_type VARCHAR(30) NOT NULL DEFAULT 'CEDULA_VENEZOLANA',
  document_storage_path TEXT NOT NULL,
  status kyc_status_enum NOT NULL DEFAULT 'PENDING',
  reviewer_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_notes TEXT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ NULL,

  CONSTRAINT chk_kyc_doc_type CHECK (document_type IN ('CEDULA_VENEZOLANA', 'PASSPORT', 'RIF'))
);

CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON public.kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON public.kyc_verifications(status);
CREATE INDEX IF NOT EXISTS idx_kyc_submitted_at ON public.kyc_verifications(submitted_at);

ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_verifications FORCE ROW LEVEL SECURITY;
