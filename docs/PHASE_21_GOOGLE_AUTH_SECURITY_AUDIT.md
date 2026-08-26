# FASE 21 — CORRECCIÓN DEFINITIVA DE AUTENTICACIÓN GOOGLE + AUDITORÍA DE SEGURIDAD

## 1. Resumen Ejecutivo
En la Fase 21 se corrigió de forma definitiva la integración con **Google OAuth + Supabase Auth**, eliminando fallos silenciosos, garantizando el flujo estándar PKCE, asegurando el cálculo de URLs de redirección para producción (GitHub Pages y Netlify), y blindando la seguridad del frontend para que ningún dato sensible o rol privilegiado pueda ser manipulado en el cliente.

---

## 2. Diagnóstico: ¿Qué estaba fallando?
1. **Falta de Feedback Visual y Manejo de Errores en UI:** Cuando el usuario hacía clic en el botón de Google, no se mostraba indicador de carga (`isSigningIn`), y si el proveedor no estaba habilitado en Supabase, el error solo se emitía en consola sin informar al usuario de manera comprensible.
2. **Cálculo de Redirección Incompleto:** La función de redirección no concatenaba de forma robusta `VITE_APP_URL` con `VITE_APP_BASE_PATH` (ejemplo `/ve/`), lo que provocaba que tras el consentimiento de Google el usuario pudiera ser redirigido a la raíz del dominio (`https://raspandolaolla-app.github.io/`) en vez de la aplicación en el subdirectorio (`https://raspandolaolla-app.github.io/ve/`).
3. **Exposición de Detalles Técnicos en Mensajes:** Algunos repositorios propagaban directamente mensajes de error internos de PostgreSQL o Supabase (`PGRST`, nombres de RPCs) hacia el usuario en lugar de presentar mensajes amigables.

---

## 3. Acciones y Correcciones Implementadas
1. **Flujo Real de Supabase OAuth (PKCE):**
   - Ejecución directa de `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams: { access_type: 'offline', prompt: 'select_account' } } })`.
   - Soporte nativo para intercambio automático de código PKCE (`detectSessionInUrl: true`) y limpieza del query param `code=` del historial del navegador con `history.replaceState`.
2. **Cálculo Centralizado y Robusto de URL de Retorno:**
   - La función `getOAuthRedirectUrl()` en `AuthContext.tsx` combina `VITE_APP_URL` (`https://raspandolaolla-app.github.io`) y `VITE_APP_BASE_PATH` (`/ve/`) evitando duplicidades y soportando tanto GitHub Pages como Netlify y entornos locales.
3. **Sanitizador de Errores para Interfaz Pública (`errorSanitizer.ts`):**
   - Módulo centralizado que convierte errores técnicos (códigos de proveedor, red, timeout, sesión expirada, cancelaciones) en mensajes amigables en español.
   - Si Google OAuth no está activado en Supabase, muestra: *"El inicio de sesión con Google todavía no está disponible. Inténtalo nuevamente más tarde."*
4. **Estados Reactivos de Carga en Botones de Google:**
   - Integrado estado `isSigningIn`, bloqueo de doble clic (`disabled`) e icono giratorio `Loader2` en:
     - `Header.tsx` (Barra de navegación principal).
     - `TablesView.tsx` (Modal de unirse y panel de mesas).
     - `WalletView.tsx` (Página de billetera).
     - `ProfileView.tsx` (Página de perfil).
5. **Banner Global de Notificaciones de Autenticación:**
   - Añadido en `App.tsx` para advertir cualquier error de conexión o cancelación de manera no intrusiva y descartable.
6. **Seguridad Estricta de Roles y RBAC:**
   - Rol predeterminado `PLAYER` para nuevos usuarios.
   - Rol `SUPER_ADMIN` restringido exclusivamente a la lista blanca verificada en base de datos:
     - `v19629049@gmail.com`
     - `pulsoplay2026@gmail.com`
   - Total ausencia de claves privilegiadas (`service_role` o Google Client Secret) en el bundle del cliente.

---

## 4. Archivos Modificados / Creados
- `src/utils/errorSanitizer.ts`: Creado para traducción y saneamiento de errores de API y base de datos.
- `src/features/auth/AuthContext.tsx`: Flujo OAuth real, cálculo de redirect URL, control de estado `isSigningIn` y captura de errores en URL.
- `src/components/layout/Header.tsx`: Botón Google con loader animado y prevención de doble clic.
- `src/features/tables/TablesView.tsx`: Botones de inicio de sesión con estados de carga.
- `src/features/wallet/WalletView.tsx`: Botón de login con estados de carga y saneamiento de errores.
- `src/features/profile/ProfileView.tsx`: Botón de login con estados de carga.
- `src/App.tsx`: Banner global de notificaciones y errores de autenticación.
- `src/services/repositories/PaymentRepository.ts`: Saneamiento de mensajes de error devueltos a la interfaz.
- `src/services/repositories/WalletRepository.ts`: Saneamiento de mensajes de error en solicitudes de retiro.
- `src/services/repositories/TableRepository.ts`: Saneamiento de mensajes de error al unirse a mesas.
- `src/services/repositories/GameRepository.ts`: Saneamiento de mensajes de error en liquidaciones y reembolsos.

---

## 5. Configuración Requerida en Servicios Externos

### A. Configuración en Supabase Dashboard
> **REQUIERE CONFIGURACIÓN MANUAL DEL PROPIETARIO**

1. Ingresar a: **Authentication** → **Providers** → **Google** en tu proyecto `tncxgwycinbnkjbfwojt`.
2. Activar el interruptor **"Enable Google provider"**.
3. Ingresar:
   - **Client ID:** (Obtenido desde Google Cloud Console).
   - **Client Secret:** (Obtenido desde Google Cloud Console).
4. En **Authentication** → **URL Configuration**:
   - **Site URL:** `https://raspandolaolla-app.github.io/ve/` (o `http://localhost:3000/` en desarrollo).
   - **Redirect URLs (Allow list):**
     - `https://raspandolaolla-app.github.io/ve/`
     - `https://raspandolaolla-app.github.io/ve/*`
     - `http://localhost:3000/`
     - `http://localhost:3000/*`

### B. Configuración en Google Cloud Console
> **REQUIERE CONFIGURACIÓN MANUAL DEL PROPIETARIO**

En la consola de Google Cloud (APIs & Services → Credentials → OAuth 2.0 Client IDs):
1. **Orígenes de JavaScript autorizados (Authorized JavaScript origins):**
   - `https://raspandolaolla-app.github.io`
   - `https://tncxgwycinbnkjbfwojt.supabase.co`
   - `http://localhost:3000`
2. **URIs de redireccionamiento autorizados (Authorized redirect URIs):**
   - `https://tncxgwycinbnkjbfwojt.supabase.co/auth/v1/callback`

### C. Variables de Entorno en GitHub Actions / Producción
En el repositorio GitHub (**Settings** → **Secrets and variables** → **Actions**):
- `VITE_SUPABASE_URL`: `https://tncxgwycinbnkjbfwojt.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: `sb_publishable_vlxeHnnl_FxJ1ziNqUsytQ_S95ZGawj`
- `VITE_APP_URL`: `https://raspandolaolla-app.github.io`
- `VITE_APP_BASE_PATH`: `/ve/`

---

## 6. Verificación de Seguridad y Compilación
- **Typecheck (`tsc --noEmit`):** 0 errores.
- **Build de Producción (`vite build`):** Exitoso.
- **Secretos en Frontend:** 0 claves `service_role`, 0 Client Secrets en código de cliente.
- **Roles y Permisos:** Protegidos por Row Level Security en Supabase y lista blanca inmutable de Super Admins.
