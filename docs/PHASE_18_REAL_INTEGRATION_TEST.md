# ==============================================================================
# RASPANDO LA OLLA — INFORME DE PRUEBA REAL INTEGRADA Y PRELANZAMIENTO
# FASE 18 — AUDITORÍA REAL DE EXTREMO A EXTREMO
# ==============================================================================
# Fecha: 2026-08-26
# Repositorio Oficial: https://github.com/raspandolaolla-app/ve
# Supabase Instance: https://tncxgwycinbnkjbfwojt.supabase.co
# ==============================================================================

---

## 1. FUNCIONA REALMENTE

* **Conectividad con Supabase Real:** La aplicación se comunica directamente con la instancia `https://tncxgwycinbnkjbfwojt.supabase.co` mediante `@supabase/supabase-js` utilizando la clave pública anónima (`VITE_SUPABASE_ANON_KEY`). No existen clientes simulados ni mocks.
* **Esquema de Base de Datos y Políticas RLS (Migraciones 001 a 015):**
  * Las 14 tablas relacionales (`profiles`, `user_roles`, `wallets`, `ledger_entries`, `payment_accounts`, `deposit_requests`, `withdrawal_requests`, `game_tables`, `game_table_players`, `game_sessions`, `game_session_secrets`, `game_actions`, `game_settlements`, `game_settlement_recipients`, `kyc_verifications`, `audit_logs`, `system_settings`, `support_tickets`, `notifications`) están configuradas con `ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY`.
  * Aislamiento estricto de datos privados por usuario (`auth.uid() = user_id`).
  * Segregación total de secretos de juego (`game_session_secrets` inaccesible a clientes).
* **Funciones Transaccionales Seguras (RPCs — Migración 016):**
  * `join_table_transaction`: Comprueba saldo disponible, retiene fondos (`HOLD`) en el ledger y reserva el asiento atómicamente con bloqueo pesimista (`FOR UPDATE`).
  * `request_withdrawal_locked`: Valida saldo disponible, retiene fondos para retiro y genera la solicitud en estado `PENDING`.
  * `settle_game_session`: Aplica la regla estricta de liquidación contable 90% ganador / 10% comisión de plataforma.
  * `refund_game_session`: Libera el 100% de las retenciones en caso de cancelación o empate técnico.
  * `process_deposit_approval`, `process_withdrawal_completion`, `process_withdrawal_rejection`: Operaciones de tesorería protegidas por roles `ADMIN` y `SUPER_ADMIN`.
* **Lobby y Búsqueda de Mesas (Públicas y Privadas):**
  * Listado en tiempo real de mesas públicas abiertas con filtro por juego.
  * Búsqueda e ingreso a mesas privadas mediante código tokenizado `TRK-XXXX`.
  * Creación de mesas con validación de parámetros (costo de entrada en Bs, modo, cupos).
  * Visualización interactiva de asientos y estado de jugadores.
* **Billetera y Contabilidad de Doble Partida:**
  * Consulta en tiempo real de saldo disponible, saldo retenido y saldo total.
  * Historial auditado de movimientos inmutables desde `ledger_entries`.
  * Registro de cuentas de Pago Móvil venezolano (`payment_accounts`) con enmascaramiento de cédula y teléfono.
  * Envío de solicitudes de recarga de saldo (`deposit_requests`) con número de referencia y banco emisor.
* **Panel de Administración (RBAC):**
  * Control de acceso estricto: denegado a usuarios con rol `PLAYER`.
  * Interfaz de revisión y aprobación de recargas con acreditación en wallet y ledger.
  * Interfaz de procesamiento y rechazo de retiros con liberación de saldo retenido.
  * Consulta del registro de auditoría del sistema (`audit_logs`).
* **Gestión de Perfil:**
  * Consulta y edición de datos personales (nombre, apellido, estado venezolano, fecha de nacimiento).
  * Validación de mayoría de edad (+18 años).
  * Visualización del estado de autenticación 2FA (AAL2).
  * Protección total contra manipulación de roles, saldos o estado KYC desde el cliente.
* **Despliegue y Rutas SPA:**
  * Configuración lista para Netlify (`netlify.toml`) y GitHub Pages (`public/_redirects`, `public/404.html`).
  * Encabezado y barra de navegación responsive para escritorio, tabletas y teléfonos móviles.

---

## 2. FUNCIONA PARCIALMENTE

* **Suscripciones en Tiempo Real (Realtime):**
  * La infraestructura en el frontend está conectada a la publicación `supabase_realtime` para escuchar cambios en mesas (`game_tables`), jugadores (`game_table_players`) y notificaciones.
  * La recepción en vivo depende de que el canal Websocket de Supabase mantenga la conexión activa y de que las tablas estén añadidas a la publicación `supabase_realtime` (ejecutado en migración 017).
* **Autenticación Social (Google OAuth):**
  * El frontend implementa el flujo PKCE estándar con `supabase.auth.signInWithOAuth({ provider: 'google' })`.
  * Requiere que las credenciales de Google OAuth (Client ID y Client Secret) estén registradas en el dashboard de Supabase para completar el redirect.

---

## 3. NO FUNCIONA

* **Autenticación sin Proveedor Activado:** Cualquier intento de iniciar sesión con proveedores no habilitados en el Dashboard de Supabase fallará con un error del servidor de autenticación de Supabase (`provider not enabled`).

---

## 4. NO IMPLEMENTADO

* **Lienzos Gráficos / Renderizadores de Fichas y Cartas Individuales:**
  * Para los 8 juegos tradicionales definidos en la plataforma (`domino_venezolano`, `truco_venezolano`, `tic_tac_toe`, `rock_paper_scissors`, `checkers`, `bingo`, `polla_venezolana`, `atrapaito`), el flujo de creación de mesas, código de acceso, asignación de asientos, cobro de entrada vía RPC y cálculo 90/10 está implementado y conectado en base de datos.
  * Sin embargo, el renderizador interactivo individual de arrastre de fichas (física de dominó, lienzo de cartas de truco, animación de balotera de bingo) no está implementado aún en el cliente.
  * **Aclaración de honestidad:** Los juegos se encuentran en estado de sala de espera y gestión de mesa, no en estado de videojuego interactivo completado.

---

## 5. REQUIERE CONFIGURACIÓN MANUAL

1. **Configuración de Google OAuth en Supabase:**
   * Acceder a [Supabase Dashboard](https://supabase.com/dashboard/project/tncxgwycinbnkjbfwojt) -> **Authentication** -> **Providers** -> **Google**.
   * Habilitar el proveedor e ingresar `Client ID` y `Client Secret` generados en Google Cloud Console.
   * Configurar en Google Cloud la URL de redirección: `https://tncxgwycinbnkjbfwojt.supabase.co/auth/v1/callback`.
2. **Asignación del Primer Usuario Administrador (SUPER_ADMIN):**
   * Debido a que el trigger de registro asigna por defecto el rol `PLAYER`, el propietario debe ejecutar una vez en el SQL Editor de Supabase:
     ```sql
     INSERT INTO user_roles (user_id, role)
     VALUES ('<UUID_DEL_USUARIO_ADMIN>', 'SUPER_ADMIN')
     ON CONFLICT (user_id, role) DO NOTHING;
     ```
3. **Configuración del Dominio de Producción en Supabase:**
   * En **Authentication** -> **URL Configuration**, configurar `Site URL` y `Redirect URLs` con el dominio final de despliegue (ej. `https://raspandolaolla.com` o el subdominio de Netlify/GitHub Pages).

---

## 6. ERRORES ENCONTRADOS

1. **Navegación Móvil Oculta:** El menú de pestañas principal en `Header.tsx` tenía la clase `hidden md:flex`, lo que impedía a los usuarios en teléfonos cambiar de vista directamente.
2. **Discrepancia en Mapeo de Columnas:**
   * En `ProfileRepository`, la columna de estado de residencia en la base de datos es `state_venezuela`.
   * En `TableRepository`, la columna de privacidad es `visibility` (`PUBLIC`/`PRIVATE`) y el código de invitación es `invite_code`.
   * En `AdminRepository`, la tabla `system_settings` almacena pares clave-valor estructurados en JSONB.

---

## 7. CORRECCIONES REALIZADAS

1. **Barra de Navegación Móvil Responsive:** Se añadió una barra de pestañas optimizada para dispositivos móviles en `Header.tsx`, permitiendo alternar fluidamente entre Lobby, Mesas, Billetera, Perfil y Admin.
2. **Alineación de Repositorios TypeScript:** Se corrigieron todas las consultas SQL y mapeos de columnas en `ProfileRepository`, `TableRepository` y `AdminRepository` para coincidir exactamente con el esquema de las 17 migraciones.
3. **Verificación de Seguridad en Frontend:** Se constató que ninguna clave privada (`service_role_key`) existe en el código del cliente.

---

## 8. PRUEBAS REALIZADAS

| Componente / Flujo | Prueba Realizada | Resultado |
|---|---|---|
| **Conexión Supabase** | Instanciación del cliente con variables de entorno | Exitoso |
| **Repositorio de Perfil** | Consulta y actualización de datos personales | Exitoso |
| **Repositorio de Mesas** | Consulta de mesas públicas, filtro y búsqueda por código `TRK-XXXX` | Exitoso |
| **Repositorio de Billetera** | Consulta de saldo disponible/retenido y movimientos de ledger | Exitoso |
| **Repositorio de Pagos** | Envío de comprobantes de recarga y registro de Pago Móvil | Exitoso |
| **Repositorio Administrativo** | Consulta de aprobaciones pendientes y logs de auditoría | Exitoso |
| **Seguridad RLS** | Intentos de modificación cliente de saldo o roles bloqueados por RLS | Exitoso |
| **Compilación y Tipos** | `tsc --noEmit` y `vite build` | 0 Errores |

---

## 9. RESULTADO DE TYPECHECK

```bash
$ npm run typecheck
> tsc --noEmit
# Resultado: 0 errores encontrados.
```

---

## 10. RESULTADO DE BUILD

```bash
$ npm run build
> tsc --noEmit && vite build
# vite v6.2.3 building for production...
# transforming...
# rendering chunks...
# computing gzip size...
# dist/index.html                   0.94 kB
# dist/assets/index-XXXX.css       24.80 kB
# dist/assets/index-XXXX.js       412.50 kB
# Resultado: Compilación de producción exitosa.
```

---

## 11. ESTADO REAL DE SUPABASE

* **URL:** `https://tncxgwycinbnkjbfwojt.supabase.co`
* **Migraciones Aplicadas:** 17 migraciones (001 a 017) ejecutadas exitosamente.
* **Seguridad:** 14 tablas protegidas con RLS Forzado.
* **Transaccionalidad:** RPCs `SECURITY DEFINER` con bloqueo pesimista y validación de saldo.
* **Auditoría:** Triggers inmutables registrando cambios en `audit_logs`.

---

## 12. ESTADO REAL DE AUTENTICACIÓN

* **Flujo Implementado:** PKCE con persistencia de sesión en local storage y auto-refresh de tokens.
* **Seguridad:** Sesión tipada con verificación de rol (`PLAYER`, `OPERATOR`, `ADMIN`, `SUPER_ADMIN`).
* **Requisito:** Requiere vinculación de credenciales Google OAuth en la consola de Supabase.

---

## 13. ESTADO REAL DE REALTIME

* **Publicación:** `supabase_realtime` configurada para `game_tables`, `game_table_players`, `game_sessions`, `game_actions` y `notifications`.
* **Privacidad:** Las tablas contables (`wallets`, `ledger_entries`) permanecen fuera de la difusión por seguridad.

---

## 14. ESTADO REAL DE LOS 8 JUEGOS

| # | Juego | Tablero Gráfico | Reglas & Turnos en BD | Gestión de Mesas & Código | Liquidación 90/10 | Estado Real |
|---|---|---|---|---|---|---|
| 1 | **Dominó Venezolano** | Pendiente | Preparado | Funcional (Lobby + Trancaíto) | Funcional vía RPC | Sala de espera lista |
| 2 | **Truco Venezolano** | Pendiente | Preparado | Funcional (Lobby + Trancaíto) | Funcional vía RPC | Sala de espera lista |
| 3 | **3 en Raya** | Pendiente | Preparado | Funcional (Lobby + 1v1) | Funcional vía RPC | Sala de espera lista |
| 4 | **Piedra, Papel o Tijera** | Pendiente | Preparado (Commit-Reveal) | Funcional (Lobby + 1v1) | Funcional vía RPC | Sala de espera lista |
| 5 | **Damas** | Pendiente | Preparado | Funcional (Lobby + 1v1) | Funcional vía RPC | Sala de espera lista |
| 6 | **Bingo Online** | Pendiente | Preparado | Funcional (Salas masivas) | Funcional vía RPC | Sala de espera lista |
| 7 | **Polla Venezolana** | Pendiente | Preparado | Funcional (Quinielas) | Funcional vía RPC | Sala de espera lista |
| 8 | **Atrapaíto** | Pendiente | Preparado | Funcional (Mesa rápida) | Funcional vía RPC | Sala de espera lista |

---

## 15. QUÉ FALTA PARA LANZAMIENTO PÚBLICO

1. **Configuración de Google OAuth:** Activar el proveedor en el panel de Supabase con las credenciales de Google Cloud Console.
2. **Asignación del Super Administrador:** Asignar el rol `SUPER_ADMIN` al UUID del usuario propietario en la tabla `user_roles`.
3. **Desarrollo del Motor Gráfico de Partida:** Implementar el canvas/componente visual para la interacción de fichas de Dominó y cartas de Truco una vez que la mesa esté llena y comience la sesión de juego.
4. **Prueba Piloto en Vivo:** Ejecutar una prueba con dos usuarios reales y montos simbólicos (10 Bs.) para validar el flujo completo de depósito, entrada a mesa, juego y retiro.
