-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 037: CORRECCIÓN DE POLÍTICAS RLS STORAGE PARA COMPROBANTES
-- ==============================================================================

-- 1. Asegurar bucket 'payment-proofs' privado con límites estrictos de MIME y tamaño
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('payment-proofs', 'payment-proofs', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];

-- 2. Política de INSERCIÓN para comprobantes de pago (Solo propietario autenticado)
DROP POLICY IF EXISTS p_storage_proofs_user_insert ON storage.objects;
CREATE POLICY p_storage_proofs_user_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR owner = auth.uid()
      OR name LIKE (auth.uid()::text || '/%')
      OR name LIKE ('receipts/' || auth.uid()::text || '_%')
    )
  );

-- 3. Política de LECTURA para comprobantes de pago (Propietario o Administrador/Operador)
DROP POLICY IF EXISTS p_storage_proofs_user_select ON storage.objects;
CREATE POLICY p_storage_proofs_user_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR owner = auth.uid()
      OR name LIKE (auth.uid()::text || '/%')
      OR name LIKE ('receipts/' || auth.uid()::text || '_%')
      OR public.is_operator_or_above(auth.uid())
    )
  );

-- 4. Política de ACTUALIZACIÓN (Solo propietario o Administrador/Operador)
DROP POLICY IF EXISTS p_storage_proofs_user_update ON storage.objects;
CREATE POLICY p_storage_proofs_user_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR owner = auth.uid()
      OR public.is_operator_or_above(auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR owner = auth.uid()
      OR public.is_operator_or_above(auth.uid())
    )
  );

-- 5. Política de ELIMINACIÓN (Solo propietario o Administrador/Operador)
DROP POLICY IF EXISTS p_storage_proofs_user_delete ON storage.objects;
CREATE POLICY p_storage_proofs_user_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR owner = auth.uid()
      OR public.is_operator_or_above(auth.uid())
    )
  );
