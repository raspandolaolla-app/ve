# ⚙️ VARIABLES DE ENTORNO — RASPANDO LA OLLA

## 1. Variables Públicas de Frontend (Vite)
Estas variables se prefijan con `VITE_` y están disponibles en el navegador:

| Variable | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase | `https://xyzproject.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Clave anónima pública de Supabase | `eyJhbGciOiJIUzI1NiIsInR5c...` |
| `VITE_APP_URL` | URL pública de la aplicación para OAuth | `https://usuario.github.io/raspando-la-olla/` |
| `VITE_APP_BASE_PATH` | Base path para Vite en subdirectorios | `/raspando-la-olla/` o `./` |

## 2. Variables Secretas (Servidor / Edge Functions)
**NUNCA colocar en `.env` del cliente ni subir a Git:**

| Variable | Ubicación Segura | Propósito |
| :--- | :--- | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function Secrets | Liquidaciones automáticas y tareas del sistema |
| `GOOGLE_CLIENT_SECRET` | Supabase Auth Provider Config | Configuración interna de Google OAuth en Supabase |
