-- ================================================================
-- MIGRACIÓN 001: Extensiones y Tipos Enumerados (ENUMs)
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

-- 1. Extensiones Criptográficas y de Identificadores Únicos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Bloque Seguro para Definición de ENUMs Idempotentes
DO $$ 
BEGIN
  -- Estados de Cuenta de Usuario
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status_enum') THEN
    CREATE TYPE account_status_enum AS ENUM (
      'PENDING_VERIFICATION',
      'ACTIVE',
      'SUSPENDED',
      'BLOCKED',
      'CLOSED'
    );
  END IF;

  -- Estados de Verificación KYC
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_status_enum') THEN
    CREATE TYPE kyc_status_enum AS ENUM (
      'UNSUBMITTED',
      'PENDING',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'NEEDS_MORE_INFORMATION'
    );
  END IF;

  -- Roles de Acceso en el Sistema (RBAC)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role_enum') THEN
    CREATE TYPE app_role_enum AS ENUM (
      'PLAYER',
      'OPERATOR',
      'ADMIN',
      'SUPER_ADMIN'
    );
  END IF;

  -- Tipos de Juegos Soportados
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'game_type_enum') THEN
    CREATE TYPE game_type_enum AS ENUM (
      'BINGO',
      'ATRAPAITO',
      'DOMINO_VENEZOLANO',
      'TRUCO_VENEZOLANO',
      'DAMAS',
      'POLLA_VENEZOLANA',
      'TRES_EN_RAYA',
      'PIEDRA_PAPEL_TIJERA'
    );
  END IF;

  -- Visibilidad de Mesas (Públicas o Trancaíto Privadas)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_visibility_enum') THEN
    CREATE TYPE table_visibility_enum AS ENUM (
      'PUBLIC',
      'PRIVATE'
    );
  END IF;

  -- Estados Operativos de Mesas
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_status_enum') THEN
    CREATE TYPE table_status_enum AS ENUM (
      'OPEN',
      'FULL',
      'STARTING',
      'ACTIVE',
      'CLOSED',
      'EXPIRED',
      'CANCELLED'
    );
  END IF;

  -- Estados de Sesión de Partida
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_status_enum') THEN
    CREATE TYPE session_status_enum AS ENUM (
      'WAITING',
      'READY',
      'STARTING',
      'ACTIVE',
      'PAUSED',
      'FINISHED',
      'CANCELLED',
      'ABANDONED',
      'SETTLED'
    );
  END IF;

  -- Estados de Participante en Mesa
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'player_table_status_enum') THEN
    CREATE TYPE player_table_status_enum AS ENUM (
      'JOINED',
      'READY',
      'PLAYING',
      'DISCONNECTED',
      'LEFT',
      'ELIMINATED'
    );
  END IF;

  -- Tipos de Movimientos Contables en Ledger
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_entry_type_enum') THEN
    CREATE TYPE ledger_entry_type_enum AS ENUM (
      'DEPOSIT_CREDIT',        -- Acreditación por recarga aprobada
      'WITHDRAWAL_HOLD',       -- Retención por solicitud de retiro
      'WITHDRAWAL_CAPTURE',    -- Débito definitivo por retiro completado
      'WITHDRAWAL_RELEASE',    -- Liberación por retiro rechazado/cancelado
      'TABLE_ENTRY_HOLD',      -- Retención de entrada al unirse a mesa
      'TABLE_ENTRY_CAPTURE',   -- Captura de pozo al iniciar partida
      'TABLE_ENTRY_REFUND',    -- Reembolso de entrada por cancelación/empate (0% fee)
      'GAME_PRIZE_CREDIT',     -- Acreditación individual de premio (parte proporcional del 90% pozo)
      'PLATFORM_FEE_CREDIT',   -- 10% Comisión de servicio a cuenta de plataforma
      'ADMIN_ADJUSTMENT'       -- Ajuste auditado por super admin
    );
  END IF;

  -- Tipos de Liquidación de Partida (Settlement)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_type_enum') THEN
    CREATE TYPE settlement_type_enum AS ENUM (
      'STANDARD_PAYOUT',       -- Ganador único (90% premio / 10% comisión)
      'SPLIT_PAYOUT',          -- Múltiples ganadores o equipos (90% pozo dividido / 10% comisión)
      'DRAW_REFUND',           -- Empate con devolución íntegra (100% reembolso / 0% comisión)
      'ADMIN_CANCEL_REFUND'    -- Cancelación administrativa (100% reembolso / 0% comisión)
    );
  END IF;

  -- Dirección Contable
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_direction_enum') THEN
    CREATE TYPE ledger_direction_enum AS ENUM (
      'CREDIT',
      'DEBIT',
      'HOLD',
      'RELEASE'
    );
  END IF;

  -- Estados de Solicitudes de Recarga
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deposit_status_enum') THEN
    CREATE TYPE deposit_status_enum AS ENUM (
      'PENDING',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
      'EXPIRED'
    );
  END IF;

  -- Estados de Solicitudes de Retiro
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'withdrawal_status_enum') THEN
    CREATE TYPE withdrawal_status_enum AS ENUM (
      'PENDING',
      'UNDER_REVIEW',
      'APPROVED',
      'PROCESSING',
      'COMPLETED',
      'REJECTED',
      'CANCELLED',
      'FAILED'
    );
  END IF;

  -- Severidad de Eventos de Auditoría
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_severity_enum') THEN
    CREATE TYPE audit_severity_enum AS ENUM (
      'INFO',
      'WARNING',
      'SECURITY_ALERT',
      'CRITICAL'
    );
  END IF;

END $$;
