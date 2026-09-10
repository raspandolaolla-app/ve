# 🔒 INFORME DEL SISTEMA DE JUEGOS PROTEGIDOS / MÓDULOS CERTIFICADOS
**Proyecto:** RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)  
**Repositorio Oficial:** https://github.com/raspandolaolla-app/ve  
**Rama:** main  
**Fecha de Generación:** 2026-09-10T15:39:47.845Z  
**Política General:** STRICT_PROTECTION  

---

## 1. RESUMEN EJECUTIVO
El sistema de protección y certificación previene regresiones accidentales en cadena donde la reparación de un juego desestabiliza dependencias compartidas de juegos previamente declarados funcionales.

- **Total de Juegos Auditados:** 10/10
- **Juegos en Estado LOCKED:** 10
- **Juegos en Estado HARD_LOCKED:** 0
- **Juegos en Reparación (UNDER_REPAIR):** 0
- **Módulos de Infraestructura Compartida:** 16

---

## 2. ESTADO DE PROTECCIÓN POR JUEGO

| ID | Nombre del Juego | Estado | Versión | Commit Certificado | Archivos Exclusivos | Pruebas Asociadas |
|---|---|---|---|---|---|---|
| `chess` | **Ajedrez** | `LOCKED` | 1.0.0 | `certified-phase29-stable` | 4 | 2 |
| `domino` | **Dominó Venezolano** | `LOCKED` | 1.0.0 | `certified-phase29-stable` | 3 | 2 |
| `truco` | **Truco Venezolano** | `LOCKED` | 1.0.0 | `certified-phase29-stable` | 3 | 2 |
| `bingo` | **Bingo** | `LOCKED` | 1.0.0 | `certified-phase29-stable` | 5 | 1 |
| `polla` | **Polla Venezolana** | `LOCKED` | 1.0.0 | `certified-phase29-stable` | 4 | 1 |
| `atrapaito` | **Atrapaíto Criollo / Parchís** | `LOCKED` | 1.0.0 | `certified-phase29-stable` | 5 | 2 |
| `checkers` | **Damas Venezolanas** | `LOCKED` | 1.0.0 | `certified-phase29-stable` | 3 | 2 |
| `rock_paper_scissors` | **Piedra, Papel o Tijera** | `LOCKED` | 1.0.0 | `certified-phase29-stable` | 3 | 4 |
| `tic_tac_toe` | **La Vieja / 3 en Raya** | `LOCKED` | 1.0.0 | `certified-phase29-stable` | 3 | 2 |
| `una_olla` | **UNA-OLLA** | `LOCKED` | 1.0.0 | `certified-phase29-stable` | 3 | 3 |

---

## 3. INVENTARIO DE INFRAESTRUCTURA COMPARTIDA Y RIESGOS

| Componente / Servicio | Ruta en Repositorio | Nivel de Riesgo | Juegos que Dependen |
|---|---|---|---|
| **GameContainer** | `src/features/games/components/GameContainer.tsx` | `CRITICAL` | Ajedrez, Dominó Venezolano, Truco Venezolano, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **TurnTimer** | `src/features/games/components/TurnTimer.tsx` | `CRITICAL` | Ajedrez, Dominó Venezolano, Truco Venezolano, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **PlayerIdentityCard** | `src/features/games/components/PlayerIdentityCard.tsx` | `HIGH` | Ajedrez, Dominó Venezolano, Truco Venezolano, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **PlayerLives** | `src/features/games/components/PlayerLives.tsx` | `MEDIUM` | Ajedrez, Dominó Venezolano, Truco Venezolano, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **SettlementModal** | `src/features/games/components/SettlementModal.tsx` | `HIGH` | Ajedrez, Dominó Venezolano, Truco Venezolano, Bingo, Polla Venezolana, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **GameArena** | `src/features/games/GameArena.tsx` | `CRITICAL` | Ajedrez, Dominó Venezolano, Truco Venezolano, Bingo, Polla Venezolana, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **useGameEngine** | `src/features/games/useGameEngine.ts` | `CRITICAL` | Ajedrez, Dominó Venezolano, Truco Venezolano, Bingo, Polla Venezolana, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **GameEngineBase** | `src/features/games/engines/GameEngine.ts` | `CRITICAL` | Ajedrez, Dominó Venezolano, Truco Venezolano, Bingo, Polla Venezolana, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **GameEngineRegistry** | `src/features/games/engines/index.ts` | `CRITICAL` | Ajedrez, Dominó Venezolano, Truco Venezolano, Bingo, Polla Venezolana, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **GameStateGuard** | `src/features/games/utils/gameStateGuard.ts` | `CRITICAL` | Ajedrez, Dominó Venezolano, Truco Venezolano, Bingo, Polla Venezolana, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **GameRepository** | `src/services/repositories/GameRepository.ts` | `MAXIMUM` | Ajedrez, Dominó Venezolano, Truco Venezolano, Bingo, Polla Venezolana, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **TableRepository** | `src/services/repositories/TableRepository.ts` | `MAXIMUM` | Ajedrez, Dominó Venezolano, Truco Venezolano, Bingo, Polla Venezolana, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **FinancialRepository** | `src/services/repositories/FinancialRepository.ts` | `MAXIMUM` | Bingo |
| **RealtimeManager** | `src/services/realtime/RealtimeManager.ts` | `MAXIMUM` | Ajedrez, Dominó Venezolano, Truco Venezolano, Bingo, Polla Venezolana, Atrapaíto Criollo / Parchís, Damas Venezolanas, Piedra, Papel o Tijera, La Vieja / 3 en Raya, UNA-OLLA |
| **PresenceService** | `src/services/PresenceService.ts` | `HIGH` |  |
| **AudioService** | `src/services/AudioService.ts` | `LOW` |  |

---

## 4. MATRIZ DETALLADA DE DEPENDENCIAS POR JUEGO

### 🔒 Ajedrez (`chess`)
- **Estado:** `LOCKED`
- **Certificado por:** Senior DevOps / Architecture Committee (2026-09-10T15:30:00Z)
- **Commit de Referencia:** `certified-phase29-stable`
- **Archivos Propios:**
  * `src/features/games/components/ChessGame.tsx`
  * `src/features/games/components/ChessBoard.tsx`
  * `src/features/games/components/ChessPieces.tsx`
  * `src/features/games/engines/ChessEngine.ts`
- **Dependencias Compartidas Críticas:**
  * `src/features/games/components/GameContainer.tsx`
  * `src/features/games/components/TurnTimer.tsx`
  * `src/features/games/components/PlayerIdentityCard.tsx`
  * `src/features/games/components/PlayerLives.tsx`
  * `src/features/games/components/SettlementModal.tsx`
  * `src/features/games/GameArena.tsx`
  * `src/features/games/useGameEngine.ts`
  * `src/features/games/engines/GameEngine.ts`
  * `src/features/games/engines/index.ts`
  * `src/features/games/utils/gameStateGuard.ts`
  * `src/services/repositories/GameRepository.ts`
  * `src/services/repositories/TableRepository.ts`
  * `src/services/realtime/RealtimeManager.ts`
- **RPCs de Base de Datos:** `expire_game_turn_secure`, `start_game_session_secure`, `settle_game_session`
- **Migraciones Históricas Protegidas:**
  * `supabase/migrations/072_add_chess_game_type.sql`
  * `supabase/migrations/083_fix_settle_game_session_ambiguity_and_chess_sync.sql`
  * `supabase/migrations/159_sequential_turn_coherence_and_atrapaito_parchis_separation.sql`
- **Suites de Pruebas:**
  * `src/tests/phase28_8_games_transversal_audit.ts`
  * `scripts/test_all_games_matrix.ts`

### 🔒 Dominó Venezolano (`domino`)
- **Estado:** `LOCKED`
- **Certificado por:** Senior DevOps / Architecture Committee (2026-09-10T15:30:00Z)
- **Commit de Referencia:** `certified-phase29-stable`
- **Archivos Propios:**
  * `src/features/games/components/DominoGame.tsx`
  * `src/features/games/components/DominoBoard.tsx`
  * `src/features/games/engines/DominoEngine.ts`
- **Dependencias Compartidas Críticas:**
  * `src/features/games/components/GameContainer.tsx`
  * `src/features/games/components/TurnTimer.tsx`
  * `src/features/games/components/PlayerIdentityCard.tsx`
  * `src/features/games/components/PlayerLives.tsx`
  * `src/features/games/components/SettlementModal.tsx`
  * `src/features/games/GameArena.tsx`
  * `src/features/games/useGameEngine.ts`
  * `src/features/games/engines/GameEngine.ts`
  * `src/features/games/engines/index.ts`
  * `src/features/games/utils/gameStateGuard.ts`
  * `src/services/repositories/GameRepository.ts`
  * `src/services/repositories/TableRepository.ts`
  * `src/services/realtime/RealtimeManager.ts`
- **RPCs de Base de Datos:** `expire_domino_turn_secure`, `expire_game_turn_secure`, `start_game_session_secure`, `settle_game_session`
- **Migraciones Históricas Protegidas:**
  * `supabase/migrations/031_domino_turn_engine_and_cleanup.sql`
  * `supabase/migrations/080_fix_multiplayer_seats_started_at_and_abandon_signature.sql`
  * `supabase/migrations/159_sequential_turn_coherence_and_atrapaito_parchis_separation.sql`
- **Suites de Pruebas:**
  * `src/tests/phase28_8_games_transversal_audit.ts`
  * `scripts/test_all_games_matrix.ts`

### 🔒 Truco Venezolano (`truco`)
- **Estado:** `LOCKED`
- **Certificado por:** Senior DevOps / Architecture Committee (2026-09-10T15:30:00Z)
- **Commit de Referencia:** `certified-phase29-stable`
- **Archivos Propios:**
  * `src/features/games/components/TrucoGame.tsx`
  * `src/features/games/components/TrucoBoard.tsx`
  * `src/features/games/engines/TrucoEngine.ts`
- **Dependencias Compartidas Críticas:**
  * `src/features/games/components/GameContainer.tsx`
  * `src/features/games/components/TurnTimer.tsx`
  * `src/features/games/components/PlayerIdentityCard.tsx`
  * `src/features/games/components/PlayerLives.tsx`
  * `src/features/games/components/SettlementModal.tsx`
  * `src/features/games/GameArena.tsx`
  * `src/features/games/useGameEngine.ts`
  * `src/features/games/engines/GameEngine.ts`
  * `src/features/games/engines/index.ts`
  * `src/features/games/utils/gameStateGuard.ts`
  * `src/services/repositories/GameRepository.ts`
  * `src/services/repositories/TableRepository.ts`
  * `src/services/realtime/RealtimeManager.ts`
- **RPCs de Base de Datos:** `expire_game_turn_secure`, `start_game_session_secure`, `settle_game_session`
- **Migraciones Históricas Protegidas:**
  * `supabase/migrations/032_game_turn_lives_and_timeout.sql`
  * `supabase/migrations/159_sequential_turn_coherence_and_atrapaito_parchis_separation.sql`
- **Suites de Pruebas:**
  * `src/tests/phase28_8_games_transversal_audit.ts`
  * `scripts/test_all_games_matrix.ts`

### 🔒 Bingo (`bingo`)
- **Estado:** `LOCKED`
- **Certificado por:** Senior DevOps / Architecture Committee (2026-09-10T15:30:00Z)
- **Commit de Referencia:** `certified-phase29-stable`
- **Archivos Propios:**
  * `src/features/games/components/BingoGame.tsx`
  * `src/features/games/components/BingoBoard.tsx`
  * `src/features/games/engines/BingoEngine.ts`
  * `src/features/games/hooks/useBingoAutoDraw.ts`
  * `src/hooks/useBingoClientDaemon.ts`
- **Dependencias Compartidas Críticas:**
  * `src/features/games/components/SettlementModal.tsx`
  * `src/features/games/GameArena.tsx`
  * `src/features/games/useGameEngine.ts`
  * `src/features/games/engines/GameEngine.ts`
  * `src/features/games/engines/index.ts`
  * `src/features/games/utils/gameStateGuard.ts`
  * `src/services/repositories/GameRepository.ts`
  * `src/services/repositories/TableRepository.ts`
  * `src/services/repositories/FinancialRepository.ts`
  * `src/services/realtime/RealtimeManager.ts`
- **RPCs de Base de Datos:** `get_or_create_automated_bingo_table`, `server_bingo_operation`, `bingo_engine_tick`, `buy_bingo_cards_secure`
- **Migraciones Históricas Protegidas:**
  * `supabase/migrations/065_bingo_virtual_sorteo_system.sql`
  * `supabase/migrations/068_bingo_la_olla_master_upgrade.sql`
  * `supabase/migrations/094_bingo_auto_draw_cron.sql`
  * `supabase/migrations/098_server_bingo_operation_rpc.sql`
  * `supabase/migrations/102_bingo_server_authoritative_draw.sql`
  * `supabase/migrations/109_centralized_bingo_draw.sql`
  * `supabase/migrations/111_bingo_fairness_lock_purchases_when_drawing.sql`
  * `supabase/migrations/114_bingo_engine_tick_rpc.sql`
  * `supabase/migrations/127_bingo_client_daemon_and_sales_fix.sql`
  * `supabase/migrations/128_fix_bingo_session_sales_and_status.sql`
  * `supabase/migrations/134_bingo_sales_open_until_first_ball.sql`
  * `supabase/migrations/139_fix_bingo_join_flow_and_states.sql`
- **Suites de Pruebas:**
  * `tests/e2e/bingo.spec.ts`

### 🔒 Polla Venezolana (`polla`)
- **Estado:** `LOCKED`
- **Certificado por:** Senior DevOps / Architecture Committee (2026-09-10T15:30:00Z)
- **Commit de Referencia:** `certified-phase29-stable`
- **Archivos Propios:**
  * `src/features/games/components/PollaGame.tsx`
  * `src/features/games/components/PollaBoard.tsx`
  * `src/features/games/engines/PollaEngine.ts`
  * `src/services/repositories/PollaRepository.ts`
- **Dependencias Compartidas Críticas:**
  * `src/features/games/components/SettlementModal.tsx`
  * `src/features/games/GameArena.tsx`
  * `src/features/games/useGameEngine.ts`
  * `src/features/games/engines/GameEngine.ts`
  * `src/features/games/engines/index.ts`
  * `src/features/games/utils/gameStateGuard.ts`
  * `src/services/repositories/GameRepository.ts`
  * `src/services/repositories/TableRepository.ts`
  * `src/services/realtime/RealtimeManager.ts`
- **RPCs de Base de Datos:** `polla_auto_draw_cron`, `get_active_polla_table`
- **Migraciones Históricas Protegidas:**
  * `supabase/migrations/033_polla_venezolana_system.sql`
  * `supabase/migrations/034_fix_polla_and_bingo_system.sql`
  * `supabase/migrations/036_polla_shift_system_and_prizes.sql`
  * `supabase/migrations/039_polla_user_isolation_and_limit.sql`
  * `supabase/migrations/055_fix_polla_single_pool_system.sql`
  * `supabase/migrations/096_polla_auto_draw_cron.sql`
- **Suites de Pruebas:**
  * `src/tests/phase28_8_games_transversal_audit.ts`

### 🔒 Atrapaíto Criollo / Parchís (`atrapaito`)
- **Estado:** `LOCKED`
- **Certificado por:** Senior DevOps / Architecture Committee (2026-09-10T15:30:00Z)
- **Commit de Referencia:** `certified-phase29-stable`
- **Archivos Propios:**
  * `src/features/games/components/AtrapaitoGame.tsx`
  * `src/features/games/components/AtrapaitoBoard.tsx`
  * `src/features/games/components/ParchisBoard.tsx`
  * `src/features/games/engines/AtrapaitoEngine.ts`
  * `src/features/games/engines/ParchisEngine.ts`
- **Dependencias Compartidas Críticas:**
  * `src/features/games/components/GameContainer.tsx`
  * `src/features/games/components/TurnTimer.tsx`
  * `src/features/games/components/PlayerIdentityCard.tsx`
  * `src/features/games/components/PlayerLives.tsx`
  * `src/features/games/components/SettlementModal.tsx`
  * `src/features/games/GameArena.tsx`
  * `src/features/games/useGameEngine.ts`
  * `src/features/games/engines/GameEngine.ts`
  * `src/features/games/engines/index.ts`
  * `src/features/games/utils/gameStateGuard.ts`
  * `src/services/repositories/GameRepository.ts`
  * `src/services/repositories/TableRepository.ts`
  * `src/services/realtime/RealtimeManager.ts`
- **RPCs de Base de Datos:** `expire_game_turn_secure`, `start_game_session_secure`, `settle_game_session`
- **Migraciones Históricas Protegidas:**
  * `supabase/migrations/115_atrapaito_realtime_multiplayer_and_abandon.sql`
  * `supabase/migrations/159_sequential_turn_coherence_and_atrapaito_parchis_separation.sql`
- **Suites de Pruebas:**
  * `src/tests/phase28_8_games_transversal_audit.ts`
  * `scripts/test_all_games_matrix.ts`

### 🔒 Damas Venezolanas (`checkers`)
- **Estado:** `LOCKED`
- **Certificado por:** Senior DevOps / Architecture Committee (2026-09-10T15:30:00Z)
- **Commit de Referencia:** `certified-phase29-stable`
- **Archivos Propios:**
  * `src/features/games/components/CheckersGame.tsx`
  * `src/features/games/components/CheckersBoard.tsx`
  * `src/features/games/engines/CheckersEngine.ts`
- **Dependencias Compartidas Críticas:**
  * `src/features/games/components/GameContainer.tsx`
  * `src/features/games/components/TurnTimer.tsx`
  * `src/features/games/components/PlayerIdentityCard.tsx`
  * `src/features/games/components/PlayerLives.tsx`
  * `src/features/games/components/SettlementModal.tsx`
  * `src/features/games/GameArena.tsx`
  * `src/features/games/useGameEngine.ts`
  * `src/features/games/engines/GameEngine.ts`
  * `src/features/games/engines/index.ts`
  * `src/features/games/utils/gameStateGuard.ts`
  * `src/services/repositories/GameRepository.ts`
  * `src/services/repositories/TableRepository.ts`
  * `src/services/realtime/RealtimeManager.ts`
- **RPCs de Base de Datos:** `expire_game_turn_secure`, `start_game_session_secure`, `settle_game_session`
- **Migraciones Históricas Protegidas:**
  * `supabase/migrations/008_game_tables_and_players.sql`
  * `supabase/migrations/009_game_sessions_and_actions.sql`
  * `supabase/migrations/159_sequential_turn_coherence_and_atrapaito_parchis_separation.sql`
- **Suites de Pruebas:**
  * `src/tests/phase28_8_games_transversal_audit.ts`
  * `scripts/test_all_games_matrix.ts`

### 🔒 Piedra, Papel o Tijera (`rock_paper_scissors`)
- **Estado:** `LOCKED`
- **Certificado por:** Senior DevOps / Architecture Committee (2026-09-10T15:30:00Z)
- **Commit de Referencia:** `certified-phase29-stable`
- **Archivos Propios:**
  * `src/features/games/components/RockPaperScissorsGame.tsx`
  * `src/features/games/components/RockPaperScissorsBoard.tsx`
  * `src/features/games/engines/RockPaperScissorsEngine.ts`
- **Dependencias Compartidas Críticas:**
  * `src/features/games/components/GameContainer.tsx`
  * `src/features/games/components/TurnTimer.tsx`
  * `src/features/games/components/PlayerIdentityCard.tsx`
  * `src/features/games/components/PlayerLives.tsx`
  * `src/features/games/components/SettlementModal.tsx`
  * `src/features/games/GameArena.tsx`
  * `src/features/games/useGameEngine.ts`
  * `src/features/games/engines/GameEngine.ts`
  * `src/features/games/engines/index.ts`
  * `src/features/games/utils/gameStateGuard.ts`
  * `src/services/repositories/GameRepository.ts`
  * `src/services/repositories/TableRepository.ts`
  * `src/services/realtime/RealtimeManager.ts`
- **RPCs de Base de Datos:** `submit_rps_move_secure`, `rps_turn_coherence_and_timeout_delegation`, `settle_game_session`
- **Migraciones Históricas Protegidas:**
  * `supabase/migrations/140_rps_commit_reveal_and_round_deadlines.sql`
  * `supabase/migrations/141_fix_rps_pgcrypto_commit_reveal.sql`
  * `supabase/migrations/142_fix_rps_player_resolution_and_secrets.sql`
  * `supabase/migrations/144_fix_rps_current_state_null_and_jsonb_safety.sql`
  * `supabase/migrations/158_rps_turn_coherence_and_timeout_delegation.sql`
  * `supabase/migrations/159_sequential_turn_coherence_and_atrapaito_parchis_separation.sql`
- **Suites de Pruebas:**
  * `scripts/test_rps_engine.ts`
  * `scripts/test-rps-suite.ts`
  * `src/tests/phase28_8_games_transversal_audit.ts`
  * `scripts/test_all_games_matrix.ts`

### 🔒 La Vieja / 3 en Raya (`tic_tac_toe`)
- **Estado:** `LOCKED`
- **Certificado por:** Senior DevOps / Architecture Committee (2026-09-10T15:30:00Z)
- **Commit de Referencia:** `certified-phase29-stable`
- **Archivos Propios:**
  * `src/features/games/components/TicTacToeGame.tsx`
  * `src/features/games/components/TicTacToeBoard.tsx`
  * `src/features/games/engines/TicTacToeEngine.ts`
- **Dependencias Compartidas Críticas:**
  * `src/features/games/components/GameContainer.tsx`
  * `src/features/games/components/TurnTimer.tsx`
  * `src/features/games/components/PlayerIdentityCard.tsx`
  * `src/features/games/components/PlayerLives.tsx`
  * `src/features/games/components/SettlementModal.tsx`
  * `src/features/games/GameArena.tsx`
  * `src/features/games/useGameEngine.ts`
  * `src/features/games/engines/GameEngine.ts`
  * `src/features/games/engines/index.ts`
  * `src/features/games/utils/gameStateGuard.ts`
  * `src/services/repositories/GameRepository.ts`
  * `src/services/repositories/TableRepository.ts`
  * `src/services/realtime/RealtimeManager.ts`
- **RPCs de Base de Datos:** `expire_game_turn_secure`, `start_game_session_secure`, `settle_game_session`
- **Migraciones Históricas Protegidas:**
  * `supabase/migrations/156_DEFINITIVE_TURN_TIMER_TIMEOUT_AND_TICTACTOE_RESOLUTION.sql`
  * `supabase/migrations/159_sequential_turn_coherence_and_atrapaito_parchis_separation.sql`
- **Suites de Pruebas:**
  * `src/tests/phase28_8_games_transversal_audit.ts`
  * `scripts/test_all_games_matrix.ts`

### 🔒 UNA-OLLA (`una_olla`)
- **Estado:** `LOCKED`
- **Certificado por:** Senior DevOps / Architecture Committee (2026-09-10T15:30:00Z)
- **Commit de Referencia:** `certified-phase29-stable`
- **Archivos Propios:**
  * `src/features/games/components/UnaOllaGame.tsx`
  * `src/features/games/components/UnaOllaCardComponent.tsx`
  * `src/features/games/engines/UnaOllaEngine.ts`
- **Dependencias Compartidas Críticas:**
  * `src/features/games/components/GameContainer.tsx`
  * `src/features/games/components/TurnTimer.tsx`
  * `src/features/games/components/PlayerIdentityCard.tsx`
  * `src/features/games/components/PlayerLives.tsx`
  * `src/features/games/components/SettlementModal.tsx`
  * `src/features/games/GameArena.tsx`
  * `src/features/games/useGameEngine.ts`
  * `src/features/games/engines/GameEngine.ts`
  * `src/features/games/engines/index.ts`
  * `src/features/games/utils/gameStateGuard.ts`
  * `src/services/repositories/GameRepository.ts`
  * `src/services/repositories/TableRepository.ts`
  * `src/services/realtime/RealtimeManager.ts`
- **RPCs de Base de Datos:** `expire_game_turn_secure`, `start_game_session_secure`, `settle_game_session`
- **Migraciones Históricas Protegidas:**
  * `supabase/migrations/066_fix_una_olla_game_type.sql`
  * `supabase/migrations/159_sequential_turn_coherence_and_atrapaito_parchis_separation.sql`
- **Suites de Pruebas:**
  * `tests/e2e/uno-olla.spec.ts`
  * `src/tests/phase28_8_games_transversal_audit.ts`
  * `scripts/test_all_games_matrix.ts`

---
## 5. PROTOCOLO DE INTERVENCIÓN Y GOBERNANZA
1. **Regla de Oro:** Ningún desarrollador ni agente de IA puede modificar un juego `LOCKED` o sus dependencias compartidas sin autorización explícita y aislamiento previo.
2. **Comando de Desbloqueo:** `npx tsx scripts/protected_games_guard.ts unlock <juego> [motivo]`.
3. **Recertificación Obligatoria:** Tras reparar el juego y validar tests/typecheck/lint/build, ejecutar `npx tsx scripts/protected_games_guard.ts protect <juego>`.
4. **Verificación en CI:** GitHub Actions ejecuta `npm run audit:protected` en cada pull request y push.

