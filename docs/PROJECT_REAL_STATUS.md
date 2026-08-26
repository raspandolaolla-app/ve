# ESTADO REAL DEL PROYECTO

```text
--------------------------------------------------
RASPANDO LA OLLA — ESTADO REAL
--------------------------------------------------

FRONTEND:
FUNCIONANDO LOCALMENTE

REACT:
IMPLEMENTADO (React 19)

TYPESCRIPT:
IMPLEMENTADO (TypeScript 5.8, 0 errores tsc)

VITE:
IMPLEMENTADO (Vite 6)

TAILWIND:
IMPLEMENTADO (Tailwind CSS v4)

JUEGOS:
CATÁLOGO IMPLEMENTADO (8 Juegos tradicionales)
TABLEROS INDIVIDUALES PENDIENTES

SUPABASE:
NO CONECTADO (Pendiente de creación de proyecto e ingreso de credenciales)

MIGRACIONES:
17 PREPARADAS
NO EJECUTADAS (Archivos SQL en /supabase/migrations/ listos)

GITHUB:
REPOSITORIO EXISTENTE A REUTILIZAR (https://github.com/raspandolaolla-app/ve)

NETLIFY:
CONFIGURACIÓN PREPARADA (netlify.toml y public/_redirects listos)
CONEXIÓN REAL PENDIENTE DE VERIFICACIÓN

GITHUB PAGES:
CONFIGURACIÓN PREPARADA (.github/workflows/deploy.yml listo)
PUBLICACIÓN REAL PENDIENTE DE VERIFICACIÓN

PAGOS REALES:
NO ACTIVADOS (Modo seguro / Simulación contable interna)

SALDOS REALES:
NO ACTIVADOS (Sin fondos financieros reales)

PRODUCCIÓN FINANCIERA:
NO ACTIVADA

--------------------------------------------------
```

---

## Detalle Desglosado por Módulo

### 1. Frontend & Experiencia de Usuario
- **Lobby:** Catálogo de 8 juegos con filtros de modalidad y estados de sala. (Funcionando localmente)
- **Mesas & Trancaíto:** Creación de mesas públicas y privadas con código `TRK-XXXX`, selección de asientos y modalidades. (Funcionando localmente)
- **Billetera:** Visualización de balances (Disponible, Retenido, Total), solicitudes de recarga y retiro con retención atómica. (Funcionando localmente)
- **Perfil & KYC:** Estados de cuenta, verificación de edad y ajustes de seguridad. (Funcionando localmente)
- **Panel Administrativo:** Métricas, gestión de roles RBAC, aprobación de comprobantes y logs de auditoría. (Funcionando localmente)

### 2. Infraestructura y Persistencia
- **Migraciones SQL:** 17 archivos en `/supabase/migrations/` con 18 tablas, constraints, triggers, RLS y funciones transaccionales `SECURITY DEFINER`. (No ejecutadas en Supabase real)
- **Supabase Auth & Realtime:** Código cliente listo en `src/lib/supabase/client.ts` y `src/services/realtime/RealtimeManager.ts`. (Pendiente de conexión remota)

### 3. Repositorio & CI/CD
- **Repositorio Destino:** `https://github.com/raspandolaolla-app/ve`
- **Workflow GitHub Actions:** `.github/workflows/deploy.yml` configurado con build y exportación para GitHub Pages.
- **Configuración Netlify:** `netlify.toml` con directivas de redirección SPA `/* -> /index.html 200`.
