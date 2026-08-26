# FASE 21.1 — CORRECCIÓN DEL CLIENTE SUPABASE EN PRODUCCIÓN

## 1. Diagnóstico y Causa Exacta del Error

### Error Reportado en Producción:
`[AuthProvider] Supabase client no configurado o ausente.`

### Causa Raíz Identificada:
1. **Archivo Responsable:** `.github/workflows/deploy.yml` (y configuración de build en producción).
2. **Mecanismo del Fallo:**
   - En Vite, las variables de entorno con prefijo `VITE_*` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`, `VITE_APP_BASE_PATH`) se incrustan estáticamente como constantes en el código JavaScript compilado durante la ejecución de **`npm run build`**.
   - En `.github/workflows/deploy.yml`, el paso de construcción `Build Web Application` únicamente definía la variable `VITE_APP_BASE_PATH: './'`, omitiendo por completo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
   - Como resultado, el comando `npm run build` ejecutado en el runner de GitHub Actions compiló el cliente frontend con `import.meta.env.VITE_SUPABASE_URL = undefined` e `import.meta.env.VITE_SUPABASE_ANON_KEY = undefined`.
   - Al cargarse la web en el navegador, `isSupabaseConfigured` evaluaba a `false`, `getSupabaseClient()` devolvía `null`, y `AuthProvider` mostraba el mensaje de advertencia y deshabilitaba el inicio de sesión.

---

## 2. Correcciones Implementadas

### A. Pipeline de GitHub Actions (`.github/workflows/deploy.yml`)
Se corrigió la inyección de variables de entorno en los pasos `Run TypeScript typecheck` y `Build Web Application`:
```yaml
      - name: Run TypeScript typecheck
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL || vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY || vars.VITE_SUPABASE_ANON_KEY }}
          VITE_APP_URL: ${{ vars.VITE_APP_URL || secrets.VITE_APP_URL || 'https://raspandolaolla-app.github.io' }}
          VITE_APP_BASE_PATH: ${{ vars.VITE_APP_BASE_PATH || secrets.VITE_APP_BASE_PATH || '/ve/' }}
        run: npm run typecheck

      - name: Build Web Application
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL || vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY || vars.VITE_SUPABASE_ANON_KEY }}
          VITE_APP_URL: ${{ vars.VITE_APP_URL || secrets.VITE_APP_URL || 'https://raspandolaolla-app.github.io' }}
          VITE_APP_BASE_PATH: ${{ vars.VITE_APP_BASE_PATH || secrets.VITE_APP_BASE_PATH || '/ve/' }}
        run: npm run build
```
*Soporta tanto GitHub Actions Repository Secrets como Repository Variables sin necesidad de cambiar los nombres.*

### B. Inicialización Centralizada y Robusta del Cliente Supabase (`src/lib/supabase/client.ts`)
- Limpieza previa de espacios en blanco (`trim()`) en `supabaseUrl` y `supabaseAnonKey`.
- Creación de un **único cliente singleton** (`supabaseInstance`) reutilizable en toda la app.
- Validación estricta `isSupabaseConfigured` antes de invocar `createClient`.
- Cero claves maestras (`service_role`) en el frontend.

### C. Proveedor de Autenticación (`src/features/auth/AuthContext.tsx`)
- Distinción clara de estados:
  1. `isConfigured`: indica si el cliente Supabase está disponible en el entorno actual.
  2. `state`: (`'loading' | 'unauthenticated' | 'authenticated' | 'error'`).
  3. Manejo de error estructurado con mensaje seguro: *"El servicio de autenticación no está disponible temporalmente."*
  4. Ocultamiento total de detalles internos (URLs de base de datos, códigos PGRST, nombres de variables).

### D. Sanitizador de Errores de Autenticación (`src/utils/errorSanitizer.ts`)
- Homologado el mensaje para proveedores de autenticación ausentes o no habilitados a:
  *"El servicio de autenticación no está disponible temporalmente."*

### E. Configuración de Netlify (`netlify.toml`)
- Declarada la versión de Node.js `22` en `[build.environment]` para asegurar paridad con los builds de GitHub Actions.

---

## 3. Variables de Entorno Requeridas

| Variable | Tipo | Propósito | Ejemplo / Valor Real |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Pública | URL del proyecto Supabase | `https://tncxgwycinbnkjbfwojt.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Pública | Anon Key (Publishable Key con RLS) | `sb_publishable_vlxeHnnl_FxJ1ziNqUsytQ_S95ZGawj` |
| `VITE_APP_URL` | Pública | Dominio base de la app para redirects OAuth | `https://raspandolaolla-app.github.io` |
| `VITE_APP_BASE_PATH` | Pública | Subdirectorio base en GitHub Pages | `/ve/` |

---

## 4. Configuración en Servicios Externos

### A. En GitHub Repository (GitHub Pages)
> **REQUIERE CONFIGURACIÓN MANUAL DEL PROPIETARIO**

1. Ir al repositorio en GitHub: **Settings** → **Secrets and variables** → **Actions**.
2. En la pestaña **Variables** (o **Secrets**), crear:
   - `VITE_SUPABASE_URL`: `https://tncxgwycinbnkjbfwojt.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `sb_publishable_vlxeHnnl_FxJ1ziNqUsytQ_S95ZGawj`
   - `VITE_APP_URL`: `https://raspandolaolla-app.github.io`
   - `VITE_APP_BASE_PATH`: `/ve/`
3. En **Settings** → **Pages**:
   - **Source:** *GitHub Actions*.

### B. En Netlify (si se usa despliegue alternativo)
> **REQUIERE CONFIGURACIÓN MANUAL DEL PROPIETARIO**

1. Ir a **Site configuration** → **Environment variables**.
2. Añadir:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_URL` (URL asignada por Netlify, ej. `https://mi-app.netlify.app`)
   - `VITE_APP_BASE_PATH` = `/`

### C. En Supabase Dashboard (`tncxgwycinbnkjbfwojt`)
> **REQUIERE CONFIGURACIÓN MANUAL DEL PROPIETARIO**

1. En **Authentication** → **URL Configuration**:
   - **Site URL:** `https://raspandolaolla-app.github.io/ve/`
   - **Redirect URLs (Allow list):**
     - `https://raspandolaolla-app.github.io/ve/`
     - `https://raspandolaolla-app.github.io/ve/*`
     - `http://localhost:3000/`
     - `http://localhost:3000/*`
2. En **Authentication** → **Providers** → **Google**:
   - Asegurar que el proveedor **Google** esté habilitado con su *Client ID* y *Client Secret*.

### D. En Google Cloud Console
> **REQUIERE CONFIGURACIÓN MANUAL DEL PROPIETARIO**

En **APIs & Services** → **Credentials** → **OAuth 2.0 Client IDs**:
- **Authorized JavaScript origins:**
  - `https://raspandolaolla-app.github.io`
  - `https://tncxgwycinbnkjbfwojt.supabase.co`
  - `http://localhost:3000`
- **Authorized redirect URIs:**
  - `https://tncxgwycinbnkjbfwojt.supabase.co/auth/v1/callback`

---

## 5. Matriz de Verificación y Estado de Componentes

| Componente | Estado | Verificación |
| :--- | :--- | :--- |
| **Cliente Supabase** | **Operativo & Singleton** | Inicialización reactiva condicionada a variables válidas. |
| **AuthProvider** | **Operativo & Seguro** | Maneja estados `loading`, `unauthenticated`, `authenticated`, `error` sin caídas. |
| **Google Login** | **Conectado (PKCE)** | Ejecuta `supabase.auth.signInWithOAuth` con `getOAuthRedirectUrl()`. |
| **Lobby & Mesas** | **Operativo** | Conexión en tiempo real y lectura de mesas activas. |
| **Wallet** | **Operativo** | Consultas a saldos, depósitos y retiros bajo RLS. |
| **Admin Panel (RBAC)** | **Blindado** | Roles verificados en base de datos; Super Admin restringido a correos autorizados. |
| **Typecheck (`tsc --noEmit`)** | **Exitoso** | 0 errores de TypeScript. |
| **Compilación (`npm run build`)** | **Exitoso** | Bundle optimizado listo para distribución estática. |
