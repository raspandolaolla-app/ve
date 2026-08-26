# CHECKLIST DE PREPRODUCCIÓN CONTROLADA (FASE 5)
**Proyecto:** RASPANDO LA OLLA — Plataforma de Juegos Tradicionales de Venezuela  
**Fecha de Evaluación:** 26 de Agosto de 2026  
**Directiva de Seguridad Activa:** `SAFE_DEVELOPMENT_MODE = true`  
**Estado:** **APROBADA**

---

## 1. Matriz de Componentes y Estado de Verificación

| Componente / Módulo | Estado | Detalle de Verificación |
| :--- | :---: | :--- |
| **Seguridad** | **OK** | Sin `service_role` en frontend. Sin secretos o API keys privadas expuestas. Entorno blindado contra cálculos financieros en cliente. |
| **Autenticación** | **OK** | Supabase Auth con OAuth / Google, persistencia de sesión JWT, roles estrictos (`PLAYER`, `OPERATOR`, `ADMIN`, `SUPER_ADMIN`), protección de rutas y redirects seguros. |
| **Base de Datos** | **OK** | 17 migraciones SQL modulares e idempotentes. 18 entidades relacionales con constraints contables (`chk_wallets_non_negative`, `chk_settlement_sum`). |
| **RLS (Row Level Security)** | **OK** | 100% de tablas sensibles con RLS forzado (`FORCE ROW LEVEL SECURITY`). Políticas granulares por `auth.uid()` y verificación de roles. |
| **Realtime** | **OK** | Canales segmentados (`lobby_public_tables`, `table_id`, `session_id`, `user_notifications`). Tablas de saldo, ledger y secretos excluidas de difusión pública. |
| **Wallet & Ledger** | **OK** | Sistema contable de doble entrada (disponible, retenido, total). Inmutabilidad en `ledger_entries`. Regla financiera 90/10 blindada en PostgreSQL. |
| **Mesas de Juego** | **OK** | Mesas públicas y salas privadas "Trancaíto" (`TRK-XXXX`). Bloqueo pesimista `SELECT ... FOR UPDATE` en procedimiento `join_table_transaction`. |
| **Administración** | **OK** | Panel de operaciones protegido con control de acceso RBAC. Aprobación/rechazo de recargas y retiros con idempotencia. |
| **Build & Compilación** | **OK** | `npm run typecheck` (`tsc --noEmit`): 0 errores. `npm run build` (`vite build`): Compilación exitosa en 482ms. |
| **Despliegue** | **Preparado** | Configuración de variables de entorno `.env.example`, base path en `vite.config.ts` y scripts de producción listos. |

---

## 2. Restricciones y Reglas Absolutas de Preproducción

- **Sin Dinero Real:** El sistema no tiene pasarelas de pago reales conectadas en este entorno.
- **Sin Saldos Reales:** Todos los registros operan bajo el marco de prueba controlada.
- **Sin Migraciones en Servidor de Producción:** Las migraciones permanecen empaquetadas en `/supabase/migrations` listas para despliegue controlado.
- **Sin Activación Comercial:** Se mantiene activo el punto de detención a la espera de autorización formal.

---

## 3. Dictamen Final

**FASE 5 — PREPRODUCCIÓN: APROBADA**
