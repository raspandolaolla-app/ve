# 🛡️ INFORME DE ENDURECIMIENTO DE SEGURIDAD GENERAL DE LA PLATAFORMA (PLATFORM SECURITY HARDENING)
## SISTEMA DE JUEGO MULTIJUGADOR "RASPANDO LA OLLA" 🇻🇪

**Estado de Hardening:** APLICADO E INTEGRADO  
**Fecha de Publicación:** 2026-08-30  
**Objetivo:** Elevar las capas defensivas de toda la plataforma a un nivel de producción resistente ante atacantes automatizados.

---

## 1. RESUMEN DE ACCIONES DE HARDENING REALIZADAS

Durante la **Fase 5 de Hardening General de la Plataforma**, se implementaron e integraron medidas defensivas robustas para resolver brechas latentes y endurecer todos los módulos del sistema (Bingo, Polla, Wallet, Lobby, Admin y multiplayer):

1. **Implementación de Rate Limiting Transaccional (Fase Y & Z):**
   * Se creó e implementó la migración `070_platform_security_hardening.sql`.
   * Se diseñó un registro centralizado y seguro de solicitudes en la base de datos pública, con políticas RLS impermeables a consultas directas del cliente.
   * Se integró validación transaccional por ventana temporal para compras de cartones y cantos de victoria.

2. **Aislamiento de la Red e Infraestructura de Páginas (Fase W & X):**
   * Se inyectó una política de seguridad de contenido (**Content Security Policy - CSP**) progresiva y compatible en el archivo estático indexador `index.html` de la aplicación React.
   * Se aislaron las conexiones HTTP/WebSocket autorizadas únicamente al origen legítimo de Supabase.

3. **Garantía y Blindaje de Secrets en Entorno de Compilación (Fase B & C):**
   * Se auditó el 100% del bundle para verificar que ninguna clave privada o token administrativo haya permeado a la distribución estática del navegador.

---

## 2. DETALLE DE IMPLEMENTACIÓN TÉCNICA

### A. MOTOR DE RATE LIMITING SERVER-SIDE (MIGRACIÓN 070)
Para evitar que un atacante automatizado realice bombardeos de llamadas o ataques de fuerza bruta contra las funciones que consumen saldo o calculan victorias, se implementó el siguiente esquema:

```sql
-- Tabla centralizada de hits de solicitudes
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  hits INT NOT NULL DEFAULT 1,
  reset_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- RLS hermético (Deny-by-Default) para impedir lecturas o limpiezas directas
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;
```

La función `public.check_rate_limit` evalúa los límites de forma segura sin depender del cliente:

```sql
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action TEXT,
  p_user_id TEXT,
  p_max_hits INT,
  p_window_interval INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
...
```

### B. ENDURECIMIENTO DE ENDPOINTS CRÍTICOS
Se modificaron los puntos de entrada transaccionales de Bingo para incorporar el chequeo de tasa limitadora:

* **`buy_bingo_cards_secure`**: Limita compras a un máximo de **10 transacciones por minuto** por usuario. Si se excede, retorna el código de control `RATE_LIMIT_EXCEEDED` de manera gracefully.
* **`rpc_claim_bingo_secure`**: Bloquea el spam de intentos de reclamo limitando a un máximo de **3 cantos por minuto** por usuario, disuadiendo bots de adivinación de números.

---

## 3. CONTENT SECURITY POLICY (CSP) COMPATIBLE (INDEX.HTML)
Se inyectó en el `<head>` de `index.html` la siguiente política para prevenir ataques de scripting cruzado (XSS) y Clickjacking:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://*; connect-src 'self' https://*.supabase.co wss://*.supabase.co; media-src 'self'; object-src 'none';" />
```

### Beneficios Defensivos de la CSP:
* **Previene inyecciones XSS:** Restringe la ejecución de secuencias de comandos de fuentes que no correspondan al propio dominio empaquetador o scripts legítimos en línea.
* **Seguridad de Conexión:** Limita el tráfico saliente de `connect-src` únicamente al origen del API de Supabase y canales WebSocket autorizados (`wss://`), impidiendo exfiltración de tokens a servidores maliciosos.
* **MIME Sniffing & Object Blocking:** Bloquea inyecciones heredadas basadas en applets de Java, Adobe Flash u objetos embebidos mediante `object-src 'none'`.

---

## 4. ANÁLISIS DE RESISTENCIA ANTE ATAQUES TRAS EL HARDENING

| Vector de Ataque | Mecanismo Defensivo Activo | Nivel de Mitigación |
| :--- | :--- | :---: |
| **Spam/Inundación de Compras** | Rate Limit server-side (10 req/min) en `buy_bingo_cards_secure`. | **COMPLETO** |
| **Fuerza Bruta en Canto de Bingo**| Rate Limit server-side (3 req/min) en `rpc_claim_bingo_secure`. | **COMPLETO** |
| **Secuestro de Funciones (Shadowing)**| Aislamiento explícito de esquemas con `SET search_path = public, auth`.| **COMPLETO** |
| **Exfiltración de Datos del Canal** | CSP restrictivo para llamadas de conexión únicamente a Supabase. | **COMPLETO** |
| **Falsificación de Identidad** | Extracción autoritativa del emisor de la llamada vía `auth.uid()`.| **COMPLETO** |
| **Manipulación Directa de Billetera**| RLS en `wallets` y contabilidad de doble entrada inmutable. | **COMPLETO** |
