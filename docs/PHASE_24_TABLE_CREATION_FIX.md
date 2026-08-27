# Fase 24.1: Corrección Definitiva de Creación de Mesas y Catálogo de Tarifas

## Resumen del Diagnóstico
Durante la creación de mesas en cualquiera de los 8 juegos de la plataforma, se presentaba el error `42P01: relation "public.entry_fees" does not exist` al intentar consultar una relación que no había sido provisionada en el esquema real de Supabase, o al intentar referenciar tablas inexistentes como `public.game_configurations`.

## Soluciones Implementadas

1. **Catálogo Central de Tarifas (`public.entry_fees`)**:
   - Estructura mínima, segura e idempotente en la migración `025_table_creation_and_entry_fee_catalog.sql`.
   - Incluye montos estándar iniciales: 10, 15, 20, 25, 50, 100, 250, 500, 1000 y 2000 Bs.
   - Políticas RLS completas: lectura pública para clientes autenticados y no autenticados, y gestión restringida a roles `OPERATOR`, `ADMIN` y `SUPER_ADMIN`.

2. **Validación de Tarifas en Servidor (`is_valid_entry_fee`)**:
   - Función `SECURITY DEFINER` que verifica que cualquier monto solicitado exista en el catálogo y se encuentre activo.
   - Admite monto 0.00 para mesas libres / de práctica.

3. **Normalización Canónica de Juegos (`fn_normalize_game_type_enum`)**:
   - Normaliza automáticamente cadenas de texto, slugs y alias para los 8 juegos del sistema (`DOMINO_VENEZOLANO`, `TRUCO_VENEZOLANO`, `TRES_EN_RAYA`, `PIEDRA_PAPEL_TIJERA`, `DAMAS`, `BINGO`, `POLLA_VENEZOLANA`, `ATRAPAITO`).

4. **RPC Segura de Creación de Mesas (`create_game_table_secure`)**:
   - **Regla Financiera Absoluta**: Crear una mesa **NO** descuenta saldo, no genera retención (HOLD) ni asientos contables en el ledger. El cobro y la retención se efectúan exclusivamente al unirse y tomar asiento mediante `join_table_transaction()`.
   - Inicializa `current_players_count = 0` para mantener consistencia estricta con `game_table_players`.
   - Generación de códigos únicos (`PUB-XXXX` para públicas y `TRK-XXXX` para privadas).
   - Sanitización de errores en backend y frontend.

5. **Alineación del Frontend (`TableRepository.ts`)**:
   - Invocación directa y exclusiva de `create_game_table_secure`.
   - Eliminación de dependencias obsoletas.
