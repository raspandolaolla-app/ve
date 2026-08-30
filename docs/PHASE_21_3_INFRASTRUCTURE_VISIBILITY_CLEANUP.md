# FASE 21.3 — AUDITORÍA Y LIMPIEZA DE VISIBILIDAD DE INFRAESTRUCTURA

## 1. Contexto y Arquitectura Actual del Proyecto

El despliegue principal y oficial de **RASPANDO LA OLLA** está estructurado bajo la siguiente arquitectura de producción:

```
[ GitHub Repository ]  -->  [ GitHub Actions (.github/workflows/deploy.yml) ]
                                    |
                                    v
                          [ GitHub Pages (/ve/) ]
                                    +
                         [ Supabase Cloud (BaaS) ]
                   (Auth PKCE + Database RLS + Realtime)
```

**Netlify** no es el proveedor principal de producción del proyecto, pero se mantiene como una opción de despliegue alternativa y de contingencia para la arquitectura frontend SPA.

---

## 2. Auditoría de Referencias a Netlify y Archivos Asociados

### A. Archivos Evaluados:

1. **`netlify.toml`**
   - **Contenido:**
     - Comando de compilación: `npm run build`
     - Directorio de publicación: `dist`
     - Versión de Node: `22`
     - Regla de redirección SPA: `[[redirects]] from = "/*" to = "/index.html" status = 200`
   - **Determinación:** **CONSERVADO INTERNAMENTE.**
     - *Justificación:* No interfiere con GitHub Pages ni con el pipeline principal de GitHub Actions. Si el propietario o un entorno de prueba decide conectar un webhook en Netlify, el archivo garantiza la compilación idéntica y la resolución de rutas SPA sin generar errores 404. No está expuesto al usuario final.

2. **`public/_redirects`**
   - **Contenido:** `/* /index.html 200`
   - **Determinación:** **CONSERVADO INTERNAMENTE.**
     - *Justificación:* Archivo estático utilizado por servidores estáticos (Cloudflare Pages, Netlify, Render, etc.) para enrutamiento SPA. Cero impacto en interfaz.

---

## 3. Matriz de Limpieza de Visibilidad en la Interfaz Pública

Se auditó minuciosamente la totalidad de componentes, vistas, pestañas administrativas, badges de estado y repositorios para erradicar cualquier fuga de términos técnicos, nombres de proveedores de infraestructura, tecnologías de base de datos o jerga de desarrollo hacia el usuario final.

| Elemento / Ubicación | Texto Técnico Anterior (INCORRECTO) | Texto Limpio y Orientado al Usuario (CORRECTO) | Clasificación |
| :--- | :--- | :--- | :--- |
| **Badge de Conexión (`ConnectionBadge.tsx`)** | `id="badge-supabase-unconfigured"` / `id="badge-supabase-connected"` | `id="badge-server-unconfigured"` / `id="badge-server-connected"` | Limpieza de identificadores de DOM |
| **Indicador de Sesión (`AdminView.tsx`)** | `Sesión activa: ... • Conexión directa a Supabase` | `Sesión activa: ... • Conexión Activa` | Remoción de proveedor en UI |
| **Tarjeta de Métricas (`AdminDashboardTab.tsx`)** | `...verificadas en el ledger de Supabase.` | `...verificadas en el sistema contable.` | Lenguaje de negocio bancario |
| **Aprobación de Recargas (`AdminDepositsTab.tsx`)** | `Fondos acreditados en ledger de Supabase.` | `Fondos acreditados en la cuenta del usuario.` | Mensaje de éxito comprensible |
| **Tarjeta de Seguridad (`AdminSecurityTab.tsx`)** | `Protección RLS + RBAC` / `Triggers SQL` / `verificación en PostgreSQL` | `Control de Acceso` / `Auditoría Inmutable (Protegido)` / `verificación en servidor y frontend` | Abstracción de tecnologías |
| **Políticas de Seguridad (`AdminSecurityTab.tsx`)** | `Idempotencia en RPCs: Las funciones process_deposit_approval...` | `Idempotencia en Operaciones: Las operaciones de aprobación...` | Enfoque de garantía operativa |
| **Banner de Auditoría (`AdminAuditTab.tsx`)** | `...triggers inmutables en PostgreSQL (UPDATE/DELETE prohibidos...)` | `...las entradas de auditoría son inmutables (modificación y eliminación prohibidas a nivel de sistema).` | Lenguaje de cumplimiento |
| **Manejador de Errores (`AuthContext.tsx`)** | `message: 'Supabase client is not configured...'` | `message: 'Authentication service is not configured in this environment.'` | Sanitización de errores internos |
| **Repositorios de Datos (`TableRepository`, `WalletRepository`, `PaymentRepository`, `GameRepository`, `AdminRepository`)** | `error: 'Supabase no inicializado'` / `error: 'Supabase no está configurado'` | `error: 'El servicio no está disponible temporalmente'` | Mensaje seguro sin fuga de dependencias |

---

## 4. Política de Vocabulario para la Interfaz de Usuario

Para garantizar una experiencia profesional, sobria y libre de tecnicismos ("Anti-Slop"), la interfaz se apega estrictamente a la siguiente correspondencia de términos:

| Concepto Técnico | Término Prohibido en UI | Término Obligatorio en UI |
| :--- | :--- | :--- |
| Conectividad con Servidor | "Supabase Realtime", "Netlify Status", "PostgreSQL Connection" | **"Servidor Activo"**, **"Conectado"**, **"Enlazando"** |
| Errores del Backend / Base de Datos | "PGRST116", "RPC Failed", "RLS Violation", "Supabase Error" | **"El servicio no está disponible temporalmente."** |
| Registro de Saldo y Fondos | "Ledger de Supabase", "Tabla ledger_entries", "Row Inserted" | **"Cuenta del usuario"**, **"Sistema contable"**, **"Saldo en Billetera"** |
| Control de Permisos | "RLS Policies", "PostgreSQL Roles", "RBAC Database Trigger" | **"Control de Acceso"**, **"Verificación de Identidad"**, **"Seguridad de Cuenta"** |
| Identificadores Internos | "UUID", "VITE_SUPABASE_URL", "Anon Key", "JWT" | **"ID de Partida"**, **"Referencia Bancaria"**, **"Código de Mesa"** |

---

## 5. Verificación de Compilación y Calidad

- **TypeScript (`npm run typecheck`):** 0 errores (`tsc --noEmit`).
- **Compilación de Producción (`npm run build`):** Generación exitosa de bundles optimizados en `dist/`.
- **Integridad Funcional:**
  - Despliegue en GitHub Pages (`/ve/`): Totalmente operativo.
  - Flujo de Autenticación PKCE: Preservado.
  - Tiempo Real y Partidas: Preservado.
  - Lógica Financiera 90/10: Preservada.
