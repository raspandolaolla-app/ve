-- ==============================================================================
-- MIGRACIÓN 133: SISTEMA DE SOPORTE EN VIVO, FAQ Y COLA DE ATENCIÓN
-- Proyecto: RASPANDO LA OLLA — Centro de Ayuda, Chat en Tiempo Real y Cola de Operadores
-- ==============================================================================

-- 0. ALIAS DE COMPATIBILIDAD PARA is_operator
CREATE OR REPLACE FUNCTION public.is_operator(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT public.is_operator_or_above(p_user_id);
$$;

-- 1. TABLA DE PREGUNTAS FRECUENTES (FAQ)
CREATE TABLE IF NOT EXISTS public.faq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar FAQs iniciales si no existen
INSERT INTO public.faq_items (category, question, answer, is_active)
SELECT 'Cuenta', '¿Cómo me registro en la plataforma?', 'Haz clic en "Ingresar" en la parte superior, selecciona "Continuar con Google" o usa tu correo. El sistema creará tu perfil y billetera automáticamente.', true
WHERE NOT EXISTS (SELECT 1 FROM public.faq_items WHERE question = '¿Cómo me registro en la plataforma?');

INSERT INTO public.faq_items (category, question, answer, is_active)
SELECT 'Cuenta', '¿Cómo recupero mi usuario o contraseña?', 'Si usaste Google, solo inicia sesión de nuevo. Si usaste correo, ve a "Ingresar" y selecciona "¿Olvidaste tu contraseña?" para recibir un enlace de recuperación.', true
WHERE NOT EXISTS (SELECT 1 FROM public.faq_items WHERE question = '¿Cómo recupero mi usuario o contraseña?');

INSERT INTO public.faq_items (category, question, answer, is_active)
SELECT 'Finanzas', '¿Cómo realizo una recarga?', 'Ve a la pestaña "Billetera", selecciona "Recargar", elige tu método de pago (Pago Móvil/Zelle), ingresa el monto y sube el comprobante. Un operador lo aprobará en minutos.', true
WHERE NOT EXISTS (SELECT 1 FROM public.faq_items WHERE question = '¿Cómo realizo una recarga?');

INSERT INTO public.faq_items (category, question, answer, is_active)
SELECT 'Finanzas', '¿Cómo solicito un retiro?', 'En "Billetera", haz clic en "Retirar", ingresa el monto y tus datos bancarios. El procesamiento toma entre 15 y 60 minutos en días hábiles.', true
WHERE NOT EXISTS (SELECT 1 FROM public.faq_items WHERE question = '¿Cómo solicito un retiro?');

INSERT INTO public.faq_items (category, question, answer, is_active)
SELECT 'Juegos', '¿Qué pasa si se me va el internet durante una partida?', '¡No te preocupes! El estado del juego se guarda en el servidor. Tienes un tiempo límite para reconectarte sin perder tu partida.', true
WHERE NOT EXISTS (SELECT 1 FROM public.faq_items WHERE question = '¿Qué pasa si se me va el internet durante una partida?');

INSERT INTO public.faq_items (category, question, answer, is_active)
SELECT 'Seguridad', '¿Mis datos bancarios y saldo están protegidos?', 'Absolutamente. Todas las transacciones se auditan en un Libro Mayor inmutable (Ledger) con cifrado SSL de extremo a extremo y autenticación multifactor.', true
WHERE NOT EXISTS (SELECT 1 FROM public.faq_items WHERE question = '¿Mis datos bancarios y saldo están protegidos?');

-- 2. TABLA DE TICKETS DE SOPORTE
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_operator_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  queue_position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  first_response_at TIMESTAMPTZ DEFAULT NULL,
  resolved_at TIMESTAMPTZ DEFAULT NULL
);

-- Foreign key con profiles para PostgREST joins amigables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'support_tickets_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_profiles_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. TABLA DE MENSAJES DEL CHAT
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('USER', 'OPERATOR', 'ADMIN', 'SYSTEM')),
  message TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. HABILITAR RLS Y POLÍTICAS
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Políticas FAQ: Lectura pública
DROP POLICY IF EXISTS "faq_select_all" ON public.faq_items;
CREATE POLICY "faq_select_all" ON public.faq_items FOR SELECT USING (true);

-- Políticas Tickets: Usuario ve los suyos, Admin/Operador ve todos
DROP POLICY IF EXISTS "tickets_select_own_or_admin" ON public.support_tickets;
CREATE POLICY "tickets_select_own_or_admin" ON public.support_tickets FOR SELECT 
USING (user_id = auth.uid() OR public.is_admin(auth.uid()) OR public.is_operator_or_above(auth.uid()));

DROP POLICY IF EXISTS "tickets_insert_own" ON public.support_tickets;
CREATE POLICY "tickets_insert_own" ON public.support_tickets FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tickets_update_admin" ON public.support_tickets;
CREATE POLICY "tickets_update_admin" ON public.support_tickets FOR UPDATE 
USING (public.is_admin(auth.uid()) OR public.is_operator_or_above(auth.uid()));

-- Políticas Mensajes: Usuario ve mensajes de su ticket, Admin ve todos
DROP POLICY IF EXISTS "messages_select_own_ticket_or_admin" ON public.chat_messages;
CREATE POLICY "messages_select_own_ticket_or_admin" ON public.chat_messages FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  OR public.is_admin(auth.uid()) OR public.is_operator_or_above(auth.uid())
);

DROP POLICY IF EXISTS "messages_insert_own_ticket_or_admin" ON public.chat_messages;
CREATE POLICY "messages_insert_own_ticket_or_admin" ON public.chat_messages FOR INSERT 
WITH CHECK (
  (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()))
  OR public.is_admin(auth.uid()) OR public.is_operator_or_above(auth.uid())
);

-- 5. FUNCIÓN RPC: CREAR TICKET Y ASIGNAR OPERADOR
CREATE OR REPLACE FUNCTION public.create_support_ticket(p_initial_message TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_ticket_id UUID;
  v_ticket_number TEXT;
  v_queue_pos INT;
  v_operator_id UUID;
  v_operator_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'NO_AUTENTICADO'; END IF;

  -- Generar número de ticket único
  v_ticket_number := 'TKT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(CAST(FLOOR(RANDOM() * 9000 + 1000)::TEXT AS TEXT), 4, '0');

  -- Calcular posición en cola (tickets WAITING o IN_PROGRESS)
  SELECT COUNT(*) + 1 INTO v_queue_pos 
  FROM public.support_tickets 
  WHERE status IN ('WAITING', 'IN_PROGRESS');

  -- Buscar operador/admin online (si existen roles asignados)
  SELECT ur.user_id INTO v_operator_id 
  FROM public.user_roles ur
  WHERE ur.role IN ('ADMIN', 'SUPER_ADMIN', 'OPERATOR')
  ORDER BY RANDOM() LIMIT 1;

  -- Crear ticket
  INSERT INTO public.support_tickets (ticket_number, user_id, assigned_operator_id, status, queue_position)
  VALUES (v_ticket_number, v_user_id, v_operator_id, CASE WHEN v_operator_id IS NOT NULL THEN 'IN_PROGRESS' ELSE 'WAITING' END, v_queue_pos)
  RETURNING id INTO v_ticket_id;

  -- Insertar mensaje inicial del sistema (Bienvenida)
  INSERT INTO public.chat_messages (ticket_id, sender_id, sender_role, message)
  VALUES (
    v_ticket_id, 
    NULL, 
    'SYSTEM', 
    'Sistema: Bienvenido al Centro de Soporte. Tu número de solicitud es ' || v_ticket_number || '. Tiempo estimado de espera: ' || CASE WHEN v_operator_id IS NOT NULL THEN 'Menos de 2 minutos' ELSE '3 a 5 minutos' END || '.'
  );

  -- Insertar mensaje del usuario si se proporcionó
  IF p_initial_message IS NOT NULL AND TRIM(p_initial_message) != '' THEN
    INSERT INTO public.chat_messages (ticket_id, sender_id, sender_role, message)
    VALUES (v_ticket_id, v_user_id, 'USER', TRIM(p_initial_message));
  END IF;

  -- Obtener nombre del operador si existe
  IF v_operator_id IS NOT NULL THEN
    SELECT display_name INTO v_operator_name FROM public.profiles WHERE id = v_operator_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket_id,
    'ticket_number', v_ticket_number,
    'queue_position', v_queue_pos,
    'assigned_operator_name', COALESCE(v_operator_name, 'Operador en turno'),
    'estimated_wait', CASE WHEN v_operator_id IS NOT NULL THEN 'Menos de 2 minutos' ELSE '3 a 5 minutos' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(TEXT) TO authenticated;

-- 6. FUNCIÓN RPC: ENVIAR MENSAJE EN EL CHAT
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_ticket_id UUID,
  p_message TEXT,
  p_image_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sender_id UUID := auth.uid();
  v_sender_role TEXT;
  v_ticket RECORD;
BEGIN
  IF v_sender_id IS NULL THEN RAISE EXCEPTION 'NO_AUTENTICADO'; END IF;

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_NO_ENCONTRADO'; END IF;

  -- Determinar rol del remitente
  IF public.is_admin(v_sender_id) OR public.is_operator_or_above(v_sender_id) THEN
    v_sender_role := CASE WHEN public.is_admin(v_sender_id) THEN 'ADMIN' ELSE 'OPERATOR' END;
    
    -- Si es la primera respuesta del operador, actualizar métricas
    IF v_ticket.first_response_at IS NULL AND v_ticket.status = 'WAITING' THEN
      UPDATE public.support_tickets 
      SET status = 'IN_PROGRESS', first_response_at = NOW()
      WHERE id = p_ticket_id;
    END IF;
  ELSE
    v_sender_role := 'USER';
  END IF;

  INSERT INTO public.chat_messages (ticket_id, sender_id, sender_role, message, image_url)
  VALUES (p_ticket_id, v_sender_id, v_sender_role, p_message, p_image_url);

  RETURN jsonb_build_object('success', true, 'message', 'Mensaje enviado');
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_chat_message(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 7. SUSCRIPCIÓN EN TIEMPO REAL
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
