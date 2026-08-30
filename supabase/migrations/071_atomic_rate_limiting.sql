-- ==============================================================================
-- 🔐 MIGRACIÓN 071: CORRECCIÓN ATÓMICA DE CONDICIÓN DE CARRERA EN RATE LIMITING
-- ==============================================================================
-- Esta migración soluciona la susceptibilidad teórica de condición de carrera
-- (TOCTOU) bajo concurrencia extrema en la función public.check_rate_limit.
-- Implementa un mecanismo atómico de bloqueo de fila pesimista (FOR UPDATE)
-- garantizando la exclusión mutua absoluta por cada usuario y acción.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action TEXT,
  p_user_id TEXT,
  p_max_hits INT,
  p_window_interval INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id TEXT;
  v_key TEXT;
  v_hits INT;
  v_reset_at TIMESTAMP WITH TIME ZONE;
  v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
  -- 1. Forzar identidad autoritativa si la llamada procede de un contexto de usuario
  -- Evita que usuarios autenticados agoten maliciosamente los límites de terceros (DoS)
  v_user_id := p_user_id;
  IF auth.uid() IS NOT NULL THEN
    v_user_id := auth.uid()::text;
  END IF;

  v_key := COALESCE(v_user_id, 'anonymous') || ':' || p_action;

  -- 2. Garantizar de forma atómica que existe un registro inicial para la clave
  -- Si ya existe, ON CONFLICT DO NOTHING evita interferir con la transacción en curso.
  INSERT INTO public.rate_limits (key, hits, reset_at)
  VALUES (v_key, 0, v_now - INTERVAL '1 hour')
  ON CONFLICT (key) DO NOTHING;

  -- 3. Bloquear la fila de forma pesimista para exclusión mutua completa en esta clave
  SELECT hits, reset_at INTO v_hits, v_reset_at
  FROM public.rate_limits
  WHERE key = v_key
  FOR UPDATE;

  -- 4. Evaluar la ventana temporal y actualizar el contador
  IF v_now > v_reset_at THEN
    -- Ventana expirada (o entrada neutra recién creada), reiniciamos conteo a 1
    UPDATE public.rate_limits
    SET hits = 1, reset_at = v_now + p_window_interval
    WHERE key = v_key;
    RETURN TRUE;
  ELSIF v_hits < p_max_hits THEN
    -- Incrementamos hits de forma segura
    UPDATE public.rate_limits
    SET hits = v_hits + 1
    WHERE key = v_key;
    RETURN TRUE;
  ELSE
    -- Límite estrictamente alcanzado o superado
    RETURN FALSE;
  END IF;
END;
$$;

-- Mantener permisos explícitos de ejecución para roles autorizados
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INTERVAL) TO authenticated, service_role;
