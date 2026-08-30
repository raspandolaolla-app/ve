-- ================================================================
-- MIGRACIÓN 020: Módulo Integral de Administración y Configuración FASE 24
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / SEGURIDAD ESTRICTA (RLS + RBAC + RPC + AUDIT)
-- ================================================================

-- 1. TABLA DE MONTOS DE ENTRADA CONFIGURABLES (Entry Fees)
CREATE TABLE IF NOT EXISTS public.entry_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(14,2) NOT NULL,
  game_type game_type_enum NULL, -- NULL significa aplicable a todos los juegos
  mode VARCHAR(30) NULL,        -- NULL significa aplicable a todas las modalidades
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_entry_fee_positive CHECK (amount > 0.00)
);

CREATE INDEX IF NOT EXISTS idx_entry_fees_active ON public.entry_fees(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_entry_fees_amount ON public.entry_fees(amount);

ALTER TABLE public.entry_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_fees FORCE ROW LEVEL SECURITY;

-- Políticas de lectura y administración de montos
DROP POLICY IF EXISTS p_entry_fees_read ON public.entry_fees;
CREATE POLICY p_entry_fees_read ON public.entry_fees
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS p_entry_fees_admin_all ON public.entry_fees;
CREATE POLICY p_entry_fees_admin_all ON public.entry_fees
  FOR ALL
  USING (public.is_operator_or_above(auth.uid()))
  WITH CHECK (public.is_operator_or_above(auth.uid()));

-- Insertar montos de entrada predeterminados solicitados en la fase 24
INSERT INTO public.entry_fees (amount, display_order, is_active)
VALUES
  (20.00, 1, true),
  (50.00, 2, true),
  (100.00, 3, true),
  (250.00, 4, true),
  (500.00, 5, true),
  (1000.00, 6, true),
  (2000.00, 7, true)
ON CONFLICT DO NOTHING;


-- 2. FUNCIÓN PARA VALIDAR MONTOS DE ENTRADA AUTORIZADOS
CREATE OR REPLACE FUNCTION public.is_valid_entry_fee(
  p_amount NUMERIC,
  p_game_type game_type_enum DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Si el monto es 0 (mesas gratuitas / prácticas), permitir si está habilitado
  IF p_amount = 0.00 THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.entry_fees
    WHERE amount = p_amount
      AND is_active = true
      AND (game_type IS NULL OR game_type = p_game_type)
  );
END;
$$;


-- 3. TABLA DE CONFIGURACIÓN DINÁMICA DE JUEGOS
CREATE TABLE IF NOT EXISTS public.game_configurations (
  game_id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  short_description TEXT NOT NULL,
  icon_name VARCHAR(50) NOT NULL DEFAULT 'Gamepad2',
  is_active BOOLEAN NOT NULL DEFAULT true,
  maintenance_message TEXT NULL,
  min_players SMALLINT NOT NULL DEFAULT 2,
  max_players SMALLINT NOT NULL DEFAULT 4,
  allowed_modes TEXT[] NOT NULL DEFAULT ARRAY['1v1', '2v2'],
  min_entry_fee NUMERIC(14,2) NOT NULL DEFAULT 20.00,
  max_entry_fee NUMERIC(14,2) NOT NULL DEFAULT 2000.00,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.game_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_configurations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_game_config_read ON public.game_configurations;
CREATE POLICY p_game_config_read ON public.game_configurations
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS p_game_config_admin ON public.game_configurations;
CREATE POLICY p_game_config_admin ON public.game_configurations
  FOR ALL
  USING (public.is_operator_or_above(auth.uid()))
  WITH CHECK (public.is_operator_or_above(auth.uid()));


-- 4. TABLA DE MANUALES Y REGLAS DE CADA JUEGO ("¿CÓMO JUGAR?")
CREATE TABLE IF NOT EXISTS public.game_manuals (
  game_id VARCHAR(50) PRIMARY KEY REFERENCES public.game_configurations(game_id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  objective TEXT NOT NULL,
  players_info TEXT NOT NULL,
  preparation TEXT NOT NULL,
  turn_rules TEXT NOT NULL,
  winning_rules TEXT NOT NULL,
  scoring_rules TEXT NOT NULL,
  disconnection_rules TEXT NOT NULL,
  cancellation_rules TEXT NOT NULL,
  full_content_markdown TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NULL REFERENCES auth.users(id)
);

ALTER TABLE public.game_manuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_manuals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_game_manuals_read ON public.game_manuals;
CREATE POLICY p_game_manuals_read ON public.game_manuals
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS p_game_manuals_admin ON public.game_manuals;
CREATE POLICY p_game_manuals_admin ON public.game_manuals
  FOR ALL
  USING (public.is_operator_or_above(auth.uid()))
  WITH CHECK (public.is_operator_or_above(auth.uid()));


-- 5. SEMBRAR LOS 8 JUEGOS TRADICIONALES Y SUS MANUALES COMPLETOS
INSERT INTO public.game_configurations (game_id, name, short_description, icon_name, is_active, min_players, max_players, allowed_modes, min_entry_fee, max_entry_fee, display_order)
VALUES
  ('domino_venezolano', 'Dominó Venezolano', 'El clásico dominó por parejas o individual a 100 puntos con tranque tradicional.', 'Grid', true, 2, 4, ARRAY['1v1', '2v2'], 20.00, 2000.00, 1),
  ('truco_venezolano', 'Truco Venezolano', 'Juego de cartas tradicional criollo con Envido, Truco, Retruco, Flor y Vira.', 'Crown', true, 2, 4, ARRAY['1v1', '2v2'], 20.00, 2000.00, 2),
  ('tres_en_raya', '3 en Raya', 'Duelo clásico de alineación estratégica a muerte súbita y velocidad.', 'Hash', true, 2, 2, ARRAY['1v1'], 20.00, 1000.00, 3),
  ('piedra_papel_tijera', 'Piedra, Papel o Tijera', 'Enfrentamiento rápido al mejor de 3 o 5 con desempate dinámico.', 'Sparkles', true, 2, 2, ARRAY['1v1'], 20.00, 500.00, 4),
  ('damas', 'Damas', 'Estrategia sobre tablero de 64 casillas con capturas obligatorias y coronación.', 'CircleDot', true, 2, 2, ARRAY['1v1'], 20.00, 1000.00, 5),
  ('bingo', 'Bingo Online', 'Salas multijugador con balotas cantadas en vivo, líneas y cartón lleno.', 'Flame', true, 2, 100, ARRAY['INDIVIDUAL'], 20.00, 2000.00, 6),
  ('polla_venezolana', 'Polla Venezolana', 'Pronósticos y apuestas por rondas con acumulación de puntos.', 'TrendingUp', true, 2, 20, ARRAY['INDIVIDUAL'], 20.00, 2000.00, 7),
  ('atrapaito', 'Atrapaíto', 'Competencia de rapidez visual y reflejos donde quien atrapa primero suma el pozo.', 'Zap', true, 2, 6, ARRAY['INDIVIDUAL'], 20.00, 1000.00, 8)
ON CONFLICT (game_id) DO UPDATE SET
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  min_players = EXCLUDED.min_players,
  max_players = EXCLUDED.max_players,
  min_entry_fee = EXCLUDED.min_entry_fee,
  max_entry_fee = EXCLUDED.max_entry_fee;

-- Insertar Manuales para los 8 juegos
INSERT INTO public.game_manuals (game_id, title, objective, players_info, preparation, turn_rules, winning_rules, scoring_rules, disconnection_rules, cancellation_rules, full_content_markdown)
VALUES
  (
    'domino_venezolano',
    'Manual Oficial de Dominó Venezolano',
    'Alcanzar 100 puntos acumulados antes que la pareja oponente colocando fichas por extremos coincidentes.',
    '2 a 4 jugadores (1v1 individual o 2v2 por parejas enfrentadas).',
    'Se utiliza el juego de 28 fichas (Doble Blanco a Doble Seis). Se reparten 7 fichas a cada jugador.',
    'Inicia el jugador con el Doble Seis (o la mano de la ronda). Los turnos avanzan en sentido antihorario. Cada jugador debe colocar una ficha coincidente o pasar si no tiene jugada posible.',
    'Gana la mano quien se quede sin fichas (Dominó) o la pareja con menor suma de puntos en caso de Tranca (Cierre).',
    'La pareja ganadora suma los puntos de las fichas restantes en manos de los oponentes. La partida termina cuando una pareja alcanza 100 puntos.',
    'Si un jugador se desconecta durante una partida activa, cuenta con 60 segundos de gracia para reconectar; transcurrido el lapso, su turno pasa automáticamente.',
    'Si una mesa se cancela antes de iniciar, el 100% de la entrada se reembolsa al saldo disponible.',
    '# Reglas de Dominó Venezolano\n\nEl Dominó Venezolano se juega a 100 puntos. Se compone de 28 fichas...'
  ),
  (
    'truco_venezolano',
    'Manual Oficial de Truco Venezolano',
    'Alcanzar 24 puntos (Buenas y Malas) mediante bazas, envite, truco y cantos de Flor.',
    '2 o 4 jugadores (1v1 o 2v2 con compañeros enfrentados).',
    'Mazo de baraja española de 40 cartas. Se vira una carta para determinar las cartas bravas (Perico y Perica).',
    'Se reparten 3 cartas por jugador. Se juega a 3 bazas consecutivas. Quien gana la primera baza tiene mano para la segunda.',
    'Gana la mano quien consiga 2 de las 3 bazas o gane la primera en caso de empate.',
    'El Envido otorga 2 puntos (o más si se revira), la Flor 3 puntos, el Truco 3 puntos, Retruco 6 puntos y Vale 4 9 puntos.',
    'El tiempo límite por turno es de 30 segundos. Desconexión prolongada concede la mano al oponente.',
    'Reembolso del 100% si la mesa no completa el cupo mínimo requerido.',
    '# Reglas del Truco Venezolano\n\nEl Truco es el juego de cartas tradicional por excelencia...'
  ),
  (
    'tres_en_raya',
    'Manual Oficial de 3 en Raya',
    'Alinear tres fichas iguales en horizontal, vertical o diagonal antes que el rival.',
    '2 jugadores (1v1).',
    'Tablero de 3x3 casillas. Un jugador usa X y el otro O.',
    'Turnos alternos con límite de 15 segundos por movimiento.',
    'El primer jugador en formar una línea de 3 gana la ronda. Si el tablero se llena sin ganador, es empate y se juega ronda extra.',
    'Partida al mejor de 3 rondas. El ganador obtiene el 90% del pozo acumulado.',
    'Si un jugador abandona o se desconecta por más de 30 segundos, pierde la partida por abandono.',
    'Reembolso íntegro si el servidor experimenta fallos durante la partida.',
    '# Reglas de 3 en Raya\n\nClásico juego de alineación rápida y reflejos...'
  ),
  (
    'piedra_papel_tijera',
    'Manual de Piedra, Papel o Tijera',
    'Vencer la elección del rival según la jerarquía elemental: Piedra vence a Tijera, Tijera a Papel, Papel a Piedra.',
    '2 jugadores (1v1).',
    'Selección simultánea y secreta en un temporizador de 10 segundos.',
    'Ambos jugadores confirman su elección sin ver la del rival hasta que se agota el tiempo.',
    'Gana la ronda la opción dominante. En caso de igual elección se produce un empate y se repite la ronda.',
    'Gana la partida quien consiga 3 victorias primero (al mejor de 5).',
    'Si un jugador no selecciona a tiempo, se genera una jugada aleatoria de emergencia.',
    'Cancelación con reembolso del 100% si ambos jugadores acuerdan salir antes de la primera ronda.',
    '# Reglas de Piedra, Papel o Tijera\n\nDuelo dinámico de toma de decisiones rápidas...'
  ),
  (
    'damas',
    'Manual de Damas Clásicas',
    'Capturar o inmovilizar todas las fichas del oponente mediante saltos diagonales.',
    '2 jugadores (1v1).',
    'Tablero de 8x8 con 12 fichas blancas y 12 fichas oscuras colocadas en casillas negras.',
    'Movimientos hacia adelante en diagonal de a una casilla. La captura de piezas contrarias es obligatoria.',
    'Las fichas que alcanzan la última fila se coronan como Damas, pudiendo moverse y capturar en cualquier sentido diagonal.',
    'Gana quien capture todas las piezas contrarias o deje al rival sin movimientos válidos.',
    '30 segundos por turno. La inactividad reiterada otorga la victoria al oponente.',
    'Reembolso total de fondos en caso de anulación administrativa.',
    '# Reglas de Damas Clásicas\n\nJuego de tablero milenario con captura obligatoria...'
  ),
  (
    'bingo',
    'Manual de Bingo Online Multijugador',
    'Completar patrones (Línea, 4 Esquinas, Centro o Cartón Lleno) a medida que se extraen las balotas.',
    'De 2 a 100 jugadores simultáneos.',
    'Cada jugador adquiere de 1 a 4 cartones numerados del 1 al 75 (o al 90).',
    'Un bombo digital extrae balotas certificadas criptográficamente de manera automática cada 4 segundos.',
    'El sistema canta automáticamente o permite marcado manual. El primer jugador en completar el patrón gana.',
    'El 90% del pozo se distribuye entre los ganadores de Línea y Cartón Lleno según las reglas de la sala.',
    'Si el jugador pierde la conexión, sus cartones siguen participando activamente en el sorteo.',
    'Si la sala no alcanza el mínimo de participantes, se cancela y se reembolsa el 100% de la entrada.',
    '# Reglas de Bingo Online\n\nSalas comunitarias con balotas en tiempo real...'
  ),
  (
    'polla_venezolana',
    'Manual de Polla Venezolana',
    'Acertar el mayor número de pronósticos en una serie de eventos o carreras.',
    'De 2 a 20 participantes.',
    'Se presenta una cartilla con los eventos programados para la jornada.',
    'Cada participante ingresa sus selecciones antes del inicio del primer evento.',
    'Cada acierto otorga puntos ponderados. La tabla de posiciones se actualiza en tiempo real.',
    'El 90% del pozo acumulado se entrega al o los participantes con mayor puntuación final.',
    'Una vez iniciado el primer evento, no se permiten modificaciones en la cartilla.',
    'Si un evento se cancela oficialmente, se redistribuye la puntuación proporcionalmente.',
    '# Reglas de la Polla Venezolana\n\nTradicional sistema de quinielas y pronósticos...'
  ),
  (
    'atrapaito',
    'Manual de Atrapaíto',
    'Reaccionar rápidamente ante patrones visuales coincidentes en el centro de la mesa.',
    'De 2 a 6 jugadores.',
    'Se coloca un pozo de cartas o fichas en el centro de la pantalla.',
    'Los jugadores revelan elementos por turnos. Cuando surge la coincidencia clave, deben presionar "¡Atrapar!".',
    'Quien presiona primero suma puntos o captura el pozo de la ronda.',
    'Al finalizar las rondas pactadas, quien acumuló más capturas gana el premio.',
    'Desconexión permite al jugador volver en la siguiente ronda si esta sigue activa.',
    'Reembolso del 100% si la partida se interrumpe antes de la mitad de las rondas.',
    '# Reglas de Atrapaíto\n\nJuego de máxima adrenalina y velocidad de reacción...'
  )
ON CONFLICT (game_id) DO UPDATE SET
  title = EXCLUDED.title,
  objective = EXCLUDED.objective,
  players_info = EXCLUDED.players_info,
  preparation = EXCLUDED.preparation,
  turn_rules = EXCLUDED.turn_rules,
  winning_rules = EXCLUDED.winning_rules,
  scoring_rules = EXCLUDED.scoring_rules,
  disconnection_rules = EXCLUDED.disconnection_rules,
  cancellation_rules = EXCLUDED.cancellation_rules,
  full_content_markdown = EXCLUDED.full_content_markdown;


-- 6. TABLA DE ANUNCIOS DEL SISTEMA (Announcements)
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'GENERAL', -- GENERAL, IMPORTANT, MAINTENANCE, PROMOTION, UPDATE, SECURITY
  priority INT NOT NULL DEFAULT 0,
  target_audience VARCHAR(30) NOT NULL DEFAULT 'ALL', -- ALL, PLAYERS, OPERATORS, UNVERIFIED
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.system_announcements(is_active, starts_at, expires_at);

ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_announcements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_announcements_read ON public.system_announcements;
CREATE POLICY p_announcements_read ON public.system_announcements
  FOR SELECT
  USING (
    is_active = true
    AND starts_at <= NOW()
    AND (expires_at IS NULL OR expires_at >= NOW())
  );

DROP POLICY IF EXISTS p_announcements_admin ON public.system_announcements;
CREATE POLICY p_announcements_admin ON public.system_announcements
  FOR ALL
  USING (public.is_operator_or_above(auth.uid()))
  WITH CHECK (public.is_operator_or_above(auth.uid()));

-- Anuncio inicial de bienvenida y seguridad
INSERT INTO public.system_announcements (title, content, type, priority, target_audience, is_active)
VALUES (
  '¡Bienvenidos a Raspando La Olla!',
  'Disfruta de nuestros 8 juegos tradicionales venezolanos con liquidaciones automáticas 90/10, protección estricta de saldo y partidas privadas Trancaíto.',
  'GENERAL',
  10,
  'ALL',
  true
) ON CONFLICT DO NOTHING;


-- 7. ACTUALIZACIÓN DE TABLA KYC PARA DOCUMENTOS PRIVADOS Y SELFIES
ALTER TABLE public.kyc_verifications 
  ADD COLUMN IF NOT EXISTS selfie_storage_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS document_back_storage_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS id_number VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS full_legal_name VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS birth_date DATE NULL;


-- 8. RPC PARA CREAR MESA CON VALIDACIÓN ESTRICTA DE SERVER
CREATE OR REPLACE FUNCTION public.create_game_table_secure(
  p_game_type game_type_enum,
  p_name VARCHAR,
  p_visibility table_visibility_enum,
  p_entry_fee NUMERIC,
  p_max_players SMALLINT,
  p_config JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_game_cfg RECORD;
  v_wallet RECORD;
  v_invite_code VARCHAR(12);
  v_table_id UUID;
  v_ledger_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_game_id_str VARCHAR;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para crear una mesa';
  END IF;

  -- 1. Validar si el juego existe y está activo
  v_game_id_str := lower(p_game_type::text);
  SELECT * INTO v_game_cfg
  FROM public.game_configurations
  WHERE game_id = v_game_id_str;

  IF FOUND AND v_game_cfg.is_active = FALSE THEN
    RAISE EXCEPTION 'GAME_INACTIVE: Este juego se encuentra en mantenimiento temporal: %', COALESCE(v_game_cfg.maintenance_message, 'Pronto estará disponible');
  END IF;

  -- 2. Validar que el monto de entrada sea un monto permitido
  IF NOT public.is_valid_entry_fee(p_entry_fee, p_game_type) THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de entrada % Bs. no está autorizado en el sistema', p_entry_fee;
  END IF;

  -- 3. Validar cantidad de jugadores
  IF p_max_players < 2 OR p_max_players > 100 THEN
    RAISE EXCEPTION 'INVALID_PLAYERS_COUNT: Cantidad de jugadores inválida (mínimo 2, máximo 100)';
  END IF;

  -- 4. Validar saldo disponible del anfitrión si la entrada es mayor a 0
  IF p_entry_fee > 0.00 THEN
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND: Billetera del usuario no encontrada';
    END IF;

    IF v_wallet.available_balance < p_entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo insuficiente. Disponible: % Bs., Requerido: % Bs.', v_wallet.available_balance, p_entry_fee;
    END IF;
  END IF;

  -- 5. Generar código de invitación seguro
  IF p_visibility = 'PRIVATE' THEN
    v_invite_code := 'TRK-' || (1000 + floor(random() * 9000))::text;
  ELSE
    v_invite_code := 'PUB-' || (1000 + floor(random() * 9000))::text;
  END IF;

  v_expires_at := NOW() + INTERVAL '2 hours';
  v_table_id := gen_random_uuid();

  -- 6. Insertar mesa
  INSERT INTO public.game_tables (
    id,
    game_type,
    host_user_id,
    visibility,
    invite_code,
    entry_fee,
    min_players,
    max_players,
    current_players_count,
    status,
    config,
    expires_at
  ) VALUES (
    v_table_id,
    p_game_type,
    v_user_id,
    p_visibility,
    v_invite_code,
    p_entry_fee,
    CASE WHEN p_max_players = 4 THEN 2 ELSE p_max_players END,
    p_max_players,
    1,
    'OPEN',
    p_config,
    v_expires_at
  );

  -- 7. Si hay monto de entrada, retener el saldo del anfitrión (Asiento 1)
  IF p_entry_fee > 0.00 THEN
    UPDATE public.wallets
    SET 
      available_balance = available_balance - p_entry_fee,
      held_balance = held_balance + p_entry_fee,
      updated_at = NOW()
    WHERE id = v_wallet.id;

    v_ledger_id := gen_random_uuid();
    INSERT INTO public.ledger_entries (
      id,
      wallet_id,
      user_id,
      entry_type,
      direction,
      amount,
      balance_after_available,
      balance_after_held,
      reference_table,
      reference_id,
      idempotency_key,
      description,
      actor_id
    ) VALUES (
      v_ledger_id,
      v_wallet.id,
      v_user_id,
      'TABLE_ENTRY_HOLD',
      'HOLD',
      p_entry_fee,
      v_wallet.available_balance - p_entry_fee,
      v_wallet.held_balance + p_entry_fee,
      'game_tables',
      v_table_id,
      'HOST_HOLD_' || v_table_id::text || '_' || v_user_id::text,
      'Retención de entrada como anfitrión en mesa ' || v_table_id::text,
      v_user_id
    );
  END IF;

  -- 8. Asignar asiento #1 al anfitrión
  INSERT INTO public.game_table_players (
    table_id,
    user_id,
    seat_number,
    status,
    entry_held_entry_id
  ) VALUES (
    v_table_id,
    v_user_id,
    1,
    'READY',
    v_ledger_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'invite_code', v_invite_code,
    'entry_fee', p_entry_fee,
    'visibility', p_visibility
  );
END;
$$;


-- 9. RPC PARA REVISIÓN ADMINISTRATIVA DE EXPEDIENTES KYC
CREATE OR REPLACE FUNCTION public.admin_process_kyc_verification(
  p_verification_id UUID,
  p_status kyc_status_enum,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_reviewer_id UUID;
  v_rec RECORD;
BEGIN
  v_reviewer_id := auth.uid();
  IF NOT public.is_operator_or_above(v_reviewer_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol de Operador o Administrador';
  END IF;

  SELECT * INTO v_rec
  FROM public.kyc_verifications
  WHERE id = p_verification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'KYC_NOT_FOUND: Expediente no encontrado';
  END IF;

  UPDATE public.kyc_verifications
  SET
    status = p_status,
    reviewer_id = v_reviewer_id,
    reviewer_notes = p_notes,
    reviewed_at = NOW()
  WHERE id = p_verification_id;

  -- Si fue aprobado, actualizar perfil
  IF p_status = 'APPROVED' THEN
    UPDATE public.profiles
    SET account_status = 'ACTIVE'
    WHERE user_id = v_rec.user_id;
  END IF;

  -- Auditoría
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    severity,
    metadata
  ) VALUES (
    v_reviewer_id,
    'ADMIN',
    'ADMIN_REVIEW_KYC',
    'kyc_verifications',
    p_verification_id::text,
    'INFO',
    jsonb_build_object(
      'target_user_id', v_rec.user_id,
      'new_status', p_status,
      'notes', p_notes
    )
  );

  -- Notificación al usuario
  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    data
  ) VALUES (
    v_rec.user_id,
    CASE 
      WHEN p_status = 'APPROVED' THEN '¡Tu cuenta ha sido verificada exitosamente!'
      WHEN p_status = 'REJECTED' THEN 'Tu verificación de identidad ha sido rechazada'
      ELSE 'Actualización en tu expediente KYC'
    END,
    CASE 
      WHEN p_status = 'APPROVED' THEN 'Ya puedes participar en mesas por dinero real y solicitar retiros.'
      WHEN p_status = 'REJECTED' THEN 'Motivo: ' || COALESCE(p_notes, 'Documentación ilegible o inconsistente. Por favor intenta de nuevo.')
      ELSE 'Tu expediente está bajo revisión por el equipo de cumplimiento.'
    END,
    'KYC',
    jsonb_build_object('kyc_id', p_verification_id, 'status', p_status)
  );

  RETURN jsonb_build_object(
    'success', true,
    'kyc_id', p_verification_id,
    'status', p_status
  );
END;
$$;
