# 🔐 FASE 21 — AUDITORÍA DE SEGURIDAD, HARDENING Y ELIMINACIÓN DE EXPOSICIÓN TÉCNICA

**PROYECTO:** RASPANDO LA OLLA 🇻🇪  
**FECHA DE AUDITORÍA:** 26 de Agosto de 2026  
**REPOSITORIO:** `https://github.com/raspandolaolla-app/ve`  
**PLATAFORMA:** React 19 + TypeScript 5.8 + Vite 6 + Tailwind CSS v4  
**BACKEND:** Supabase (PostgreSQL 15+)  
**HOSTING:** GitHub Pages / Netlify  

---

## 1. Alcance de la Auditoría

Se realizó una revisión integral y exhaustiva de:
1. **Secretos y Credenciales:** Búsqueda perimetral de claves privadas, `service_role`, credenciales de bases de datos, tokens de acceso y contraseñas en código fuente, scripts, documentación y artefactos de distribución.
2. **Historial de Configuración y Variables de Entorno:** Auditoría de `.env.example`, `.gitignore`, `.github/workflows/deploy.yml` y configuración de Vite.
3. **Exposición Técnica en Frontend:** Eliminación de mensajes de error internos (nombres de RPC, códigos PGRST, excepciones SQL, menciones de proveedores internos) y centralización en capa de sanitización amigable (`sanitizeUserErrorMessage`).
4. **Seguridad en Supabase:** RLS forzado en tablas críticas, procedimientos almacenados `SECURITY DEFINER` con `search_path` seguro, verificación de RBAC en base de datos e inmutabilidad de los administradores principales protegidos.
5. **Autenticación con Google OAuth:** Flujo PKCE, detección segura de sesión y protección de Client Secrets fuera del cliente frontend.
6. **Integridad de Motores de Juego:** Validación de los 8 motores locales con aislamiento de estados privados y verificación contable de la regla 90/10.

---

## 2. Archivos Inspeccionados y Modificados

### Archivos Inspeccionados
- `src/lib/supabase/client.ts`
- `src/features/auth/AuthContext.tsx`
- `src/utils/errorSanitizer.ts`
- `src/lib/security/sanitizer.ts`
- `src/hooks/useSupabaseStatus.ts`
- `src/components/common/ConnectionBadge.tsx`
- `src/components/layout/SafeDevelopmentBanner.tsx`
- `src/features/wallet/WalletView.tsx`
- `src/features/tables/TablesView.tsx`
- `src/features/admin/AdminView.tsx`
- `src/features/admin/tabs/*` (12 tabs modulares)
- `src/features/games/components/GameContainer.tsx`
- `src/features/games/engines/*` (8 motores de juego)
- `scripts/migrate.ts`
- `scripts/test-phase20-integration.ts`
- `.github/workflows/deploy.yml`
- `.gitignore`
- `.env.example`
- `vite.config.ts`
- `package.json`
- `supabase/migrations/` (001 a 019)

### Modificaciones Aplicadas
1. **`scripts/migrate.ts`:**
   - **Riesgo Detectado:** Existencia de cadena de conexión PostgreSQL con contraseña en texto plano en el script CLI.
   - **Corrección:** Se eliminó la credencial en texto plano y se configuró la lectura estricta desde variables de entorno seguras (`DATABASE_URL` o `SUPABASE_DB_URL`).
2. **`src/components/common/ConnectionBadge.tsx`:**
   - **Riesgo Detectado:** Texto técnico "Servidor: Enlazando" y "Servidor Activo".
   - **Corrección:** Se homogenizó el texto visible a "Conectado", "Conectando..." y "Sin conexión" sin terminología interna.
3. **`src/features/wallet/WalletView.tsx`:**
   - **Corrección:** Integración de `sanitizeUserErrorMessage` en los flujos de recarga, solicitud de retiro y registro de cuenta de Pago Móvil para evitar que errores SQL o de red muestren trazas técnicas al usuario.
4. **`src/features/tables/TablesView.tsx`:**
   - **Corrección:** Integración de `sanitizeUserErrorMessage` en la reserva de asientos y creación de mesas.
5. **`src/features/games/components/GameContainer.tsx`:**
   - **Corrección:** Manejo sanitizado de errores en la persistencia de jugadas en tiempo real.
6. **`src/features/admin/AdminView.tsx` y pestañas administrativas:**
   - **Corrección:** Sanitización de respuestas en alertas y modales de aprobación de recargas, retiros, cancelación de mesas, soporte y recuperación mutua.

---

## 3. Estado de Detección de Secretos

| Tipo de Credencial / Secreto | Estado en Frontend (`src/`, `public/`, `dist/`) | Ubicación Autorizada / Correcta |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **0 DETECTADOS** | Supabase Edge Functions / Backend Secrets |
| Contraseñas de Base de Datos | **0 DETECTADOS** | Variables de entorno de backend |
| OAuth Client Secret (`GOCSPX-...`) | **0 DETECTADOS** | Supabase Auth Provider Config |
| JWT Signing Secrets | **0 DETECTADOS** | Supabase Auth Internal Config |
| Tokens privados de GitHub (`ghp_...`) | **0 DETECTADOS** | GitHub Actions Secrets |
| Claves API privadas de terceros | **0 DETECTADOS** | Variables de entorno protegidas |

*Nota de buenas prácticas:* La cadena de conexión temporal que existía en `scripts/migrate.ts` fue retirada y se recomienda la rotación preventiva de la contraseña de la base de datos desde el panel de Supabase si el script fue compartido previamente en repositorios públicos.

---

## 4. Variables Públicas vs. Secretos Privados

### Variables Públicas de Vite (Permitidas en el bundle del navegador)
- `VITE_SUPABASE_URL`: Endpoint público de la API de Supabase.
- `VITE_SUPABASE_ANON_KEY`: Clave pública anónima de Supabase con permisos limitados por RLS.
- `VITE_APP_URL`: URL base pública de la aplicación para redirects de OAuth.
- `VITE_APP_BASE_PATH`: Subdirectorio de despliegue en GitHub Pages (`/ve/`).

### Secretos Privados (Prohibidos en frontend y `.env.example`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD`
- `GOOGLE_CLIENT_SECRET`
- `DATABASE_URL`

---

## 5. Auditoría de Seguridad por Capa

### A. Autenticación y Autorización
- **Google OAuth:** Configurado con flujo PKCE y almacenamiento de sesión seguro en `localStorage` del cliente.
- **RBAC:** Roles validados en servidor PostgreSQL (`user_roles`).
- **Super Admins Protegidos:** Lista inmutable (`v19629049@gmail.com` y `pulsoplay2026@gmail.com`) protegida contra degradación o eliminación no autorizada.

### B. Base de Datos y RLS
- **RLS Activo:** Tablas de billetera (`wallets`), libro contable (`ledger_entries`), solicitudes financieras (`deposit_requests`, `withdrawal_requests`), secreto de juegos (`game_session_secrets`) y registros de auditoría (`audit_logs`) con aislamiento forzado por usuario.
- **Procedimientos `SECURITY DEFINER`:** Bloqueo pesimista `SELECT ... FOR UPDATE`, saneamiento de `search_path = public, auth` y verificación de autorización previa.

### C. Motores de Juego
- 8 motores tradicionales ejecutando en cliente con validación determinística.
- Secreto de información del adversario (manos de Truco, fichas de Dominó, elecciones de Piedra/Papel/Tijera) protegido en la capa de persistencia y no expuesto en publicaciones públicas de Realtime.

---

## 6. Verificación de Compilación y Calidad

- **Pruebas de Integración de 8 Motores (Fase 20):** `38/38 PASADAS (100%)`
- **TypeScript Typecheck (`npm run typecheck`):** `0 errores`
- **Vite Production Build (`npm run build`):** `EXITOSO (dist/ generado)`
- **Inspección de `dist/`:** `0 secretos privados en el bundle de producción`

---

## 7. Pendientes Manuales Externos

1. **Configuración de Google OAuth en Supabase Dashboard:** Activar el proveedor Google en Authentication > Providers e introducir el Client ID y Client Secret correspondientes.
2. **Rotación Preventiva de Credencial:** Si la contraseña de la base de datos fue transferida en texto plano fuera del entorno seguro, rotarla en el dashboard de Supabase (Project Settings > Database).
