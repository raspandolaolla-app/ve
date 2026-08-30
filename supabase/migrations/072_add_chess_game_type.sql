-- ==============================================================================
-- MIGRACIÓN 072: REGISTRO E INTEGRACIÓN DEFINITIVA DE CHESS EN GAME_TYPE_ENUM Y RPCS
-- Proyecto: RASPANDO LA OLLA / PulsoPLAY
-- Estado: PRODUCCIÓN / SERVIDOR AUTORITATIVO IDEMPOTENTE
-- ==============================================================================

-- 1. Asegurar la presencia del enum 'CHESS' en public.game_type_enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'game_type_enum'::regtype AND enumlabel = 'CHESS'
  ) THEN
    ALTER TYPE public.game_type_enum ADD VALUE 'CHESS';
  END IF;
END $$;

-- 2. Actualizar fn_normalize_game_type_enum para dar soporte completo a CHESS y sus alias
CREATE OR REPLACE FUNCTION public.fn_normalize_game_type_enum(p_game_str TEXT)
RETURNS game_type_enum
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := UPPER(TRIM(COALESCE(p_game_str, '')));
  
  -- Conversión de kebab-case o minusculas a nombres de enum
  v_normalized := REPLACE(v_normalized, '-', '_');

  CASE v_normalized
    WHEN 'DOMINO', 'DOMINO_VENEZOLANO', 'DOMINÓ', 'DOMINO-VENEZOLANO' THEN
      RETURN 'DOMINO_VENEZOLANO'::game_type_enum;
    WHEN 'TRUCO', 'TRUCO_VENEZOLANO', 'TRUCO-VENEZOLANO' THEN
      RETURN 'TRUCO_VENEZOLANO'::game_type_enum;
    WHEN 'TIC_TAC_TOE', 'TRES_EN_RAYA', 'LA_VIEJA', 'VIEJA', 'TIC-TAC-TOE' THEN
      RETURN 'TRES_EN_RAYA'::game_type_enum;
    WHEN 'ROCK_PAPER_SCISSORS', 'PIEDRA_PAPEL_TIJERA', 'PIEDRA_PAPEL_O_TIJERA' THEN
      RETURN 'PIEDRA_PAPEL_TIJERA'::game_type_enum;
    WHEN 'CHECKERS', 'DAMAS', 'DAMAS_ESPANOLAS', 'DAMAS_INTERNACIONALES' THEN
      RETURN 'DAMAS'::game_type_enum;
    WHEN 'BINGO', 'BINGO_75', 'BINGO_90', 'BINGO_LATINO' THEN
      RETURN 'BINGO'::game_type_enum;
    WHEN 'POLLA', 'POLLA_VENEZOLANA', 'POLLA_FUTBOL', 'POLLA_DEPORTIVA' THEN
      RETURN 'POLLA_VENEZOLANA'::game_type_enum;
    WHEN 'ATRAPAITO', 'ATRAPA_AL_MILLON', 'TRIVIA_ATRAPAITO', 'ATRAPA' THEN
      RETURN 'ATRAPAITO'::game_type_enum;
    WHEN 'UNA_OLLA', 'UNA-OLLA', 'UNA_OLLA_CARD_GAME', 'OLLA', 'RASPANDO_LA_OLLA', 'RASPANDO' THEN
      RETURN 'UNA_OLLA'::game_type_enum;
    WHEN 'CHESS', 'AJEDREZ', 'CHESS_GAME', 'AJEDREZ_2_JUGADORES' THEN
      RETURN 'CHESS'::game_type_enum;
    ELSE
      -- Intento directo de casteo si coincide exactamente con el tipo
      BEGIN
        RETURN v_normalized::game_type_enum;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_GAME_TYPE: El tipo de juego "%" no es válido.', p_game_str;
      END;
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_normalize_game_type_enum(TEXT) TO authenticated, anon, service_role;
