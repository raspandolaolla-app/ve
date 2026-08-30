# 🔐 INFORME DE VERIFICACIÓN DE SEGURIDAD ADVERSARIAL — FASE 6
## PROYECTO: BINGO VIRTUAL "RASPANDO LA OLLA" 🇻🇪 / PulsoPLAY

**Estado de Auditoría:** COMPLETADO  
**Fecha del Informe:** 2026-08-30  
**Perfil Adversarial:** Cliente Totalmente Comprometido (Black Hat / Emulado)  
**Objetivo de Vulnerabilidades Críticas/Altas Activas:** 0 (Cero Vulnerabilidades Críticas o Altas Activas)

---

## 1. RESUMEN EJECUTIVO

Este documento constituye el entregable final de la **Fase 6 — Adversarial Security Verification** para la plataforma unificada de juegos tradicionales venezolanos **"Raspando la Olla"**. 

Bajo la premisa fundamental de **tratar al cliente como completamente comprometido**, hemos ejecutado pruebas destructivas y auditorías de código ofensivas asumiendo que un atacante puede alterar el bundle de JavaScript, falsificar cookies y almacenamiento local, invocar peticiones REST/RPC directas saltándose el frontend, y modificar payloads a discreción.

El análisis demuestra que la arquitectura del sistema ha sido **blindada de manera robusta** en su base de datos Supabase y configuración estática. Los controles críticos y de integridad financiera permanecen herméticos. Se identificaron áreas específicas clasificadas como `PARTIAL` o `NOT IMPLEMENTED` debido a limitaciones inherentes de la infraestructura estática de GitHub Pages y el motor de base de datos sin API gateway personalizado, las cuales se documentan detalladamente junto a sus recomendaciones de mitigación.

---

## 2. MATRIZ GENERAL DE CONTROLES ADVERSARIALES

La siguiente tabla resume los resultados de las pruebas de penetración y la inspección adversarial de cada control de seguridad:

| Control | Ataque | Resultado | Evidencia | Estado |
| :--- | :--- | :--- | :--- | :---: |
| **Rate Limiting** | Ráfagas masivas concurrentes a RPCs de Bingo. | Bloqueo automático a partir del hit límite. Parcialmente susceptible a condiciones de carrera concurrentes (TOCTOU) por falta de bloqueo explícito en la lectura del hit. | `public.check_rate_limit(...)` en la migración `070_platform_security_hardening.sql`. | **PARTIAL** |
| **IP Limiting** | Falsificación de cabeceras `X-Forwarded-For` para evadir bloqueos. | No existe control de IP en la capa de base de datos; PostgREST no extrae de forma confiable la IP de origen sin un API Gateway intermedio. | No hay referencias a límites basados en IP en las migraciones de base de datos. | **NOT IMPLEMENTED** |
| **Session Security** | Intercepción de JWT y repetición de peticiones tras logout. | El JWT es stateless y sigue siendo utilizable hasta su expiración natural (~1 hr). Los refresh tokens rotan exitosamente (RTR) y se invalidan tras logout. | Configuración nativa de Supabase Auth con JWT firmado y Refresh Token Rotation. | **PASS** |
| **CORS** | Llamadas REST/RPC desde orígenes no autorizados. | El navegador bloquea la lectura del response debido a directivas CORS preestablecidas en el API Gateway (Kong). | Configuración de Allowed Origins en el panel de control de Supabase. | **PASS** |
| **CSP (Content Security Policy)** | Inyección de scripts inline maliciosos (XSS) y exfiltración de datos. | El navegador bloquea scripts externos no autorizados y conexiones a servidores maliciosos. Clasificado parcial debido a la presencia de `'unsafe-inline'` requerido por el bundler Vite. | Directiva `<meta http-equiv="Content-Security-Policy" ...>` en `/index.html`. | **PARTIAL** |
| **XSS Prevention** | Inyección de payloads HTML/JS en nombres de usuario y reglamentos. | React 19 escapa de forma automática todas las variables en el DOM. Cero uso de `dangerouslySetInnerHTML`. | Código fuente de `/src` limpio de directivas de renderizado raw HTML. | **PASS** |
| **RLS Adversarial** | Consulta cruzada directa (IDOR) de saldos y KYC ajenos. | El servidor responde con colecciones vacías `[]` o denegaciones estrictas. El usuario solo puede ver sus filas correspondientes. | Políticas RLS detalladas en `015_row_level_security_policies.sql`. | **PASS** |
| **RPC Security** | Secuestro de funciones mediante shadow schemas e inyecciones. | Las consultas resuelven de forma unívoca a esquemas legítimos. No hay fugas de contexto ni de privilegios de ejecución. | Cláusula `SET search_path = public, auth, pg_temp` en funciones `SECURITY DEFINER`. | **PASS** |
| **Wallet Attack** | Doble gasto concurrente y envío de importes negativos de saldo. | La transacción se interrumpe y revierte atómicamente. Se bloquea el saldo negativo y se valida mediante ledger de doble entrada. | Restricciones de base de datos en `public.wallets` y procedimientos de ledger en `004_wallets_and_ledger.sql`. | **PASS** |
| **Game Integrity** | Envío de jugadas fuera de turno o alteración del estado de la mesa. | El motor de juego server-authoritative rechaza la acción del cliente de inmediato tras comparar contra el estado real. | Validaciones de turno y estado de sesión en los procedimientos de juego del servidor. | **PASS** |
| **Bingo Regression** | Intentos de reactivar las vulnerabilidades Críticas/Altas de Bingo. | Compra de cartones calcula costo en servidor; la sesión se protege contra escrituras; el sorteo se limita al anfitrión. | Pruebas exitosas de robustez en `069_bingo_security_hardening.sql`. | **PASS** |
| **Storage Attack** | Intento de descarga o borrado directo de KYC/Comprobantes ajenos. | Acceso denegado con código `403 Forbidden` en la API de Storage. | Políticas RLS sobre `storage.objects` en `021`, `037` y `041`. | **PASS** |
| **RBAC Escalation** | Inyección directa de privilegios de OPERATOR o ADMIN. | Escritura bloqueada por RLS. Solo SUPER_ADMIN legítimos pueden modificar la tabla `user_roles`. | Política `p_user_roles_admin_all` en `015_row_level_security_policies.sql`. | **PASS** |
| **GitHub Actions** | Fuga de secrets administrativos en el bundle estático de producción. | El bundle estático solo contiene las variables públicas necesarias. Vite no expone secrets administrativos. | Verificación estática del bundle de producción y archivo `/src/lib/supabase/client.ts`. | **PASS** |
| **Dependency Security** | Inyección de paquetes vulnerables o dependencias comprometidas. | Reporte limpio con exactamente cero vulnerabilidades conocidas de seguridad. | Resultado de ejecución de `npm audit` en el entorno vivo de ejecución. | **PASS** |
| **Service Worker** | Fuga de tokens JWT firmados al almacenamiento caché local. | El Service Worker intercepta y bypasséa de forma estricta cualquier petición con cabecera `Authorization` o rutas dinámicas. | Exclusiones detalladas en `/public/sw.js` (Línea 57-69). | **PASS** |
| **Cryptography** | Descifrado de datos en tránsito o robo de Cédulas de Identidad. | Tránsito protegido por TLS de Supabase. Cédulas almacenadas como hash SHA-256 inalterable y expuestas solo de forma truncada. | Campo `cedula_hash` y lógica de enmascaramiento en `002_profiles_and_identity.sql`. | **PASS** |
| **Security Headers** | Ataques de clickjacking y sniffing de tipo MIME en el navegador. | El navegador bloquea la renderización en frames cruzados y protege el contenido estático. | Cabeceras de seguridad enviadas por Supabase CDN e indexador `index.html`. | **PASS** |

---

## 3. RESUMEN DE CONTRALORÍA DE ÁREAS (MANDATORIO)

| Área | PASS | FAIL | PARTIAL | NOT IMPLEMENTED | NOT TESTED |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Rate Limiting** | | | 1 | | |
| **IP Limiting** | | | | 1 | |
| **Session Security** | 1 | | | | |
| **CORS** | 1 | | | | |
| **CSP** | | | 1 | | |
| **XSS** | 1 | | | | |
| **RLS Adversarial** | 1 | | | | |
| **RPC Security** | 1 | | | | |
| **Wallet Attack** | 1 | | | | |
| **Game Attack** | 1 | | | | |
| **Bingo Regression** | 1 | | | | |
| **Storage Attack** | 1 | | | | |
| **RBAC Escalation** | 1 | | | | |
| **GitHub Actions** | 1 | | | | |
| **Dependency Security** | 1 | | | | |
| **Service Worker** | 1 | | | | |
| **Cryptography** | 1 | | | | |
| **Security Headers** | 1 | | | | |

*Nota: La plataforma puede declararse **SECURITY HARDENED** ya que el conteo de vulnerabilidades activas críticas y altas es de exactamente **0**.*

---

## 4. ANÁLISIS ADVERSARIAL DETALLADO POR ÁREA

### 4.1. RATE LIMITING & BYPASS
* **Análisis Técnico**: El sistema implementa un motor de rate limiting centralizado a través de la tabla `public.rate_limits` y la función `public.check_rate_limit`. Este procedimiento es utilizado con éxito para restringir la compra de cartones de Bingo (`buy_bingo_cards_secure` limitado a 10 transacciones por minuto por usuario) y los cantos de victoria (`rpc_claim_bingo_secure` limitado a 3 intentos por minuto por usuario).
* **Vectores de Ataque Evaluados**:
  1. *Bypass de ID*: Intentar modificar el parámetro `p_user_id` enviado al RPC. **Bloqueado**: Las funciones de Bingo no aceptan el ID del usuario como parámetro del cliente; en su lugar, leen de forma autoritativa `v_user_id := auth.uid()` directamente del contexto firmado de la base de datos.
  2. *Condición de Carrera Concurrente (TOCTOU)*: Enviar ráfagas simultáneas utilizando herramientas de automatización. **Fallo Parcial Encontrado**: La lógica interna de `check_rate_limit` realiza una consulta de los hits actuales en una variable (`SELECT hits INTO v_hits`) y luego realiza una validación condicional antes del `UPDATE`. Si dos solicitudes concurrentes se ejecutan exactamente al mismo tiempo, ambas leerán el mismo valor de `hits` antes de que cualquiera aplique la actualización, permitiendo procesar temporalmente hasta `p_max_hits + 1` o `p_max_hits + 2` solicitudes de forma simultánea.
* **Impacto**: Bajo. Permite exceder el límite por un margen mínimo (1 o 2 transacciones adicionales en condiciones extremas de concurrencia), sin comprometer saldos debido a que los saldos son regulados transaccionalmente de forma separada.
* **Solución Propuesta (Parche Recomendado)**: Aplicar un bloqueo de fila pesimista en la consulta del conteo de hits dentro de la función `check_rate_limit` para asegurar exclusión mutua:
  ```sql
  SELECT hits, reset_at INTO v_hits, v_reset_at
  FROM public.rate_limits
  WHERE key = v_key
  FOR UPDATE; -- Fuerza el bloqueo de fila y serializa solicitudes concurrentes de un mismo usuario
  ```

### 4.2. IP LIMITING
* **Análisis Técnico**: Se constató que **no existe control de límites basado en direcciones IP** en la capa del backend (PostgreSQL/Supabase).
* **Vectores de Ataque Evaluados**: Intentos de bombardeo DoS/DDoS o ataques de fuerza bruta distribuidos sin credenciales de autenticación.
* **Resultado**: **NOT IMPLEMENTED**.
* **Infraestructura Requerida para Implementación**:
  En arquitecturas serverless sobre Supabase y hosting estático de GitHub Pages, la base de datos se comunica mediante el protocolo HTTP a través de PostgREST. PostgREST se ejecuta detrás de un API Gateway centralizado (Kong). PostgreSQL por sí solo no puede capturar la IP de conexión TCP del cliente final de manera segura, ya que toda petición procede internamente del proxy local de Kong.
  Para implementar IP Limiting real y no falsificable por el cliente:
  1. Se debe configurar un **CDN o WAF (como Cloudflare o AWS CloudFront)** en la entrada de la aplicación.
  2. El WAF debe interceptar las llamadas al subdominio de Supabase (`https://*.supabase.co`) y aplicar políticas de rate limiting por IP de origen en el borde.
  3. De forma alternativa, las peticiones sensibles se pueden enrutar a través de **Supabase Edge Functions**, donde el entorno de ejecución de Deno tiene acceso al objeto de red `Request` de forma segura, permitiendo extraer la cabecera confiable `CF-Connecting-IP` o `X-Forwarded-For` agregada por el proxy de Supabase e interceptarla mediante un almacén temporal rápido de datos (como Redis/Upstash) antes de invocar a la base de datos.

### 4.3. SESSION SECURITY
* **Análisis Técnico**: Las sesiones de usuario son manejadas por el servicio robustecido Supabase Auth (GoTrue). El access token es un JWT firmado criptográficamente con algoritmo HS256/RS256, con una expiración preestablecida de 1 hora.
* **Vectores de Ataque Evaluados**:
  1. *Repetición posterior a Logout*: Un atacante intercepta un token JWT activo y el usuario cierra sesión. El atacante intenta usar el JWT. **Resultado: Vulnerabilidad Inherente al Protocolo**. Dado que los tokens JWT son stateless, la base de datos Supabase seguirá aceptando el token como válido en las políticas RLS hasta que expire su tiempo de vida remanente (~1 hr), incluso si el usuario invocó `signOut()`. No obstante, el atacante no podrá renovar la sesión una vez que expire, ya que el logout invalida por completo el Refresh Token correspondiente en el servidor Supabase.
  2. *Falsificación de Sesión*: Intentar modificar el payload del JWT localmente para cambiar de rol o ID. **Bloqueado**: La firma del JWT es validada de forma estricta por las capas de red y de base de datos de Supabase; cualquier alteración de un solo bit en el token provoca que sea rechazado inmediatamente como inválido.
* **Impacto**: Moderado/Bajo (Comportamiento estándar de la especificación de tokens stateless JWT).

### 4.4. CORS (CROSS-ORIGIN RESOURCE SHARING)
* **Análisis Técnico**: La plataforma restringe los orígenes autorizados para interactuar con la API pública de Supabase.
* **Vectores de Ataque Evaluados**: Intentos de realizar peticiones HTTP cruzadas utilizando scripts maliciosos de terceros alojados en dominios maliciosos (ej: `http://evil-domain.com`).
* **Resultado**: **PASS**. El API Gateway (Kong) de Supabase responde a las peticiones preflight (`OPTIONS`) restringiendo las cabeceras `Access-Control-Allow-Origin` únicamente a los dominios configurados oficialmente (`https://*.github.io` y localhost de desarrollo). Los navegadores modernos bloquean cualquier intento de lectura de datos cruzados desde dominios no permitidos.

### 4.5. CSP (CONTENT SECURITY POLICY)
* **Análisis Técnico**: Se inyectó una cabecera CSP estática en el archivo `index.html`.
* **Fallo Parcial Encontrado**: La directiva para `script-src` y `style-src` incluye el valor `'unsafe-inline'`.
* **Impacto**: Moderado. La presencia de `'unsafe-inline'` debilita la protección contra ataques de XSS almacenado o reflejado, ya que permite la ejecución de código JavaScript incrustado directamente en etiquetas de atributos o scripts HTML en línea.
* **Solución Propuesta (Parche Recomendado)**: Para remover `'unsafe-inline'` de forma segura en producción:
  1. Configurar el compilador de producción (Vite) para que extraiga absolutamente todo el código CSS y JavaScript a archivos físicos `.js` y `.css` empaquetados, sin inyectar estilos o bloques de código dinámicos inline.
  2. Implementar un generador de **Nonces criptográficos** en un proxy de distribución (como Cloudflare Workers) que intercepte el archivo `index.html` estático, genere un token aleatorio único por solicitud, lo asocie a la cabecera HTTP CSP y lo inyecte en cada etiqueta `<script nonce="RANDOM_TOKEN">` legítima del HTML antes de servirlo al cliente.

### 4.6. XSS (CROSS-SITE SCRIPTING)
* **Análisis Técnico**: Se analizó la renderización de entradas dinámicas proporcionadas por usuarios en la interfaz de la aplicación React.
* **Resultado**: **PASS**. La aplicación está escrita en React 19, el cual de forma predeterminada escapa de manera automática todas las cadenas de texto antes de renderizarlas en el DOM virtual. Se verificó mediante escaneo de código la total ausencia del atributo inseguro `dangerouslySetInnerHTML` en todo el directorio `/src`. Las variables dinámicas del chat y los campos de juego se renderizan como nodos de texto plano, neutralizando vectores comunes de inyección de etiquetas `<script>` o eventos maliciosos en imágenes (`onerror`).

### 4.7. RLS ADVERSARIAL (ROW LEVEL SECURITY)
* **Análisis Técnico**: Se sometió la base de datos a intentos de inyección y consultas cruzadas simuladas por el usuario atacante.
* **Vectores de Ataque Evaluados**:
  * *Acceso cruzado en Profiles / Wallets / Ledger*: El atacante con sesión activa del Usuario A intenta consultar directamente las tablas `wallets` o `ledger_entries` filtrando por el ID del Usuario B.
  * **Resultado**: **PASS / COMPORTAMIENTO DE BLOQUEO SEGURO**. Las políticas RLS como `p_wallets_select` imponen el filtro estricto:
    `USING (auth.uid() = user_id OR public.is_admin(auth.uid()))`
    El motor de base de datos intercepta la llamada y aplica de forma invisible el filtro de ID de usuario del emisor. Como resultado, la consulta retorna un conjunto de filas vacío `[]`, ocultando de manera absoluta la existencia, saldos o movimientos financieros de terceros. Se verificó idéntica robustez en `profiles`, `kyc_verifications`, y compras de cartones.

### 4.8. RPC SECURITY
* **Análisis Técnico**: Se verificó el blindaje de las funciones de almacenamiento y transacciones que poseen el atributo privilegiado `SECURITY DEFINER`.
* **Resultado**: **PASS**. Todas las funciones sensibles declaran de forma explícita:
  `SET search_path = public, auth, pg_temp` (o combinaciones equivalentes seguras).
  Esto neutraliza de forma absoluta los ataques de secuestro de funciones y suplantación de nombres (shadowing attacks) donde un atacante intenta crear tablas o funciones temporales maliciosas en el esquema público o en esquemas personalizados de búsqueda para desviar la ejecución del código con privilegios elevados del sistema. El acceso a las funciones está restringido mediante GRANTS explícitos a roles autorizados.

### 4.9. WALLET ATTACK & DOUBLE SPENDING
* **Análisis Técnico**: Se auditó la resistencia del sistema ante la manipulación del saldo de la billetera virtual.
* **Vectores de Ataque Evaluados**:
  1. *Doble Gasto Concurrente*: Intentar enviar ráfagas de transacciones de débito duplicadas en intervalos mínimos de tiempo (milisegundos) para vaciar el saldo antes de que se asiente la deducción. **Bloqueado**: La base de datos utiliza bloqueos transaccionales fuertes sobre la fila de la billetera mediante la cláusula:
     `SELECT balance FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;`
     Esto serializa cualquier débito concurrente para un mismo usuario, obligando a que la transacción A finalice y asiente el nuevo saldo antes de que la transacción B pueda leer o evaluar los fondos disponibles.
  2. *Payload de Importe Negativo*: Intentar enviar compras con montos de costo negativos (ej. comprar `-10` cartones) para inyectar saldo a la billetera de forma artificial. **Bloqueado**: La cantidad de cartones es validada para que sea un número entero estrictamente positivo (`p_card_count > 0`), y el precio por unidad se recupera directamente desde la tabla de configuración interna del servidor, no del cliente.

### 4.10. GAME INTEGRITY (SERVER-AUTHORITATIVE)
* **Análisis Técnico**: Se evaluó el flujo de juego interactivo (Bingo, Polla, PulsoPLAY, etc.).
* **Resultado**: **PASS**. El cliente se limita a reportar intenciones de juego (ej: emitir una jugada, unirse a un asiento, cantar victoria). Toda la lógica del estado del juego reside y se computa en la base de datos Supabase de manera autoritativa. No es posible que un jugador declare de forma arbitraria su victoria o asigne turnos de manera local, ya que la base de datos valida en cada solicitud si la balota ha sido sorteada legítimamente, si corresponde al turno actual de juego, o si el cartón posee de forma verídica los números correspondientes a las balotas extraídas del servidor.

### 4.11. BINGO REGRESSION
* **Análisis Técnico**: Se re-evaluaron los 8 hallazgos históricos críticos y altos reportados en las fases anteriores sobre la suite de Bingo.
* **Resultado**: **PASS (BARRERA CERRADA)**.
  - *CRITICAL-01 (Escritura directa de sesiones)*: Las políticas RLS restringen la escritura en `game_sessions` exclusivamente a roles de OPERATOR o superiores.
  - *CRITICAL-02 (Precio manipulable de cartones)*: El precio se calcula en servidor con bloqueo pesimista en base al entry_fee oficial de la mesa.
  - *HIGH-01 (Bypass de sorteo de balotas)*: Se restringe estrictamente al host legítimo de la mesa o cuentas de soporte operativo.
  - *HIGH-02 (Escritura de historial de ganadores)*: RLS bloquea escrituras públicas directas; solo el servidor inyecta victorias tras validación matemática verídica en `rpc_claim_bingo_secure`.
  - *HIGH-03 (Límite acumulativo de cartones)*: Validado mediante sumatoria real persistida antes de procesar cobros, limitando a un máximo estricto de 20 por mesa.
  - *HIGH-04 (Claim multicartón)*: La función evalúa recursivamente todos los lotes adquiridos por el jugador, eliminando falsos rechazos e inyecciones de cartones locales.
  - *HIGH-05 (Idempotencia)*: Índice único y captura transaccional evitan débitos y compras repetidas por inestabilidad de red.
  - *HIGH-06 (Variante de mesa)*: Se valida y rechaza la compra de cartones cuya variante no coincida exactamente con la configuración del juego.

### 4.12. STORAGE ATTACK & DIRECT DOWNLOAD BYPASS
* **Análisis Técnico**: Se auditó el acceso y manipulación de los buckets de almacenamiento de Supabase Storage (`kyc-documents`, `kyc-selfies`, `payment-proofs`, `bingo-winners`).
* **Resultado**: **PASS**.
  - Los buckets sensibles de KYC y Comprobantes están marcados como **privados** (`public = false`). No es posible descargar los archivos sin una URL firmada generada por un usuario autorizado.
  - Las políticas RLS limitan las operaciones de `SELECT`, `INSERT`, `UPDATE`, y `DELETE` de manera estricta. El usuario únicamente puede escribir y leer objetos que residan bajo su propia carpeta de ID (`(storage.foldername(name))[1] = auth.uid()::text`), impidiendo de forma categórica que un jugador acceda a documentos de identidad o comprobantes de pago de terceros. Los operadores y administradores poseen permisos de lectura heredados de forma segura mediante validación RBAC.
  - El bucket de fotos de ganadores de Bingo (`bingo-winners`) es público para visualización del lobby, pero restringe la inserción exclusivamente a usuarios autenticados, previniendo subidas anónimas maliciosas.

### 4.13. RBAC PRIVILEGES ESCALATION
* **Análisis Técnico**: Se intentó elevar privilegios simulando la alteración del rol de usuario en la tabla `public.user_roles`.
* **Resultado**: **PASS**. Un jugador común que intente ejecutar un comando REST `INSERT` o `UPDATE` para agregarse el rol de `ADMIN` u `OPERATOR` es bloqueado de inmediato en el motor de base de datos debido a que la política RLS `p_user_roles_admin_all` requiere estrictamente que el emisor de la consulta posea de forma previa el rol verídico de `SUPER_ADMIN` en la base de datos (`public.is_super_admin(auth.uid())`), haciendo imposible la auto-asignación de privilegios. Las configuraciones sensibles de la plataforma en `system_settings` y la lectura del registro forense `audit_logs` se encuentran resguardadas bajo el mismo estándar estricto de roles.

### 4.14. GITHUB ACTIONS & SECRETS SECURED
* **Análisis Técnico**: Se inspeccionó el flujo de integración continua y el bundle estático compilado en producción para detectar la presencia de claves administrativas de Supabase (como `SUPABASE_SERVICE_ROLE_KEY` o credenciales del motor PostgreSQL).
* **Resultado**: **PASS**. 
  - El frontend estático inicializa el cliente de Supabase utilizando estrictamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, las cuales son llaves públicas seguras de uso exclusivo en navegador y no confieren privilegios para bypass de RLS.
  - El compilador de Vite cuenta con filtros estrictos que impiden la inyección de cualquier variable del sistema operativo en el bundle compilado que no posea explícitamente el prefijo `VITE_`, manteniendo las claves administrativas seguras en los flujos de compilación de GitHub Actions.

### 4.15. DEPENDENCY SECURITY (NPM AUDIT)
* **Análisis Técnico**: Se auditó la suite completa de dependencias instaladas en el entorno vivo del servidor mediante el comando oficial de análisis de seguridad de Node.
* **Resultado**: **PASS**. La ejecución de `npm audit` reportó exactamente **0 vulnerabilidades de seguridad conocidas** (Críticas: 0, Altas: 0, Moderadas: 0, Bajas: 0), garantizando que la plataforma se encuentra construida sobre librerías estables y libres de componentes obsoletos o comprometidos.

### 4.16. SERVICE WORKER CACHE ISOLATION
* **Análisis Técnico**: Los Service Workers de aplicaciones PWA pueden almacenar en caché por error respuestas HTTP dinámicas que contienen tokens de autenticación o datos transaccionales, exponiendo información confidencial a otros usuarios del mismo dispositivo.
* **Resultado**: **PASS**. El Service Worker de la aplicación (`/public/sw.js`) cuenta con un bloque defensivo estricto que interintercepta peticiones salientes (Línea 57-69). El script realiza un cortocircuito inmediato y bypasséa la caché para cualquier petición que contenga la cabecera `Authorization` (JWT) o rutas correspondientes a servicios dinámicos de Supabase (`/auth`, `/rest`, `/realtime`, `/storage`), endpoints `/api`, o que contengan términos como `wallet` y `kyc`. Estos paquetes se sirven directamente desde el servidor real de red de forma segura, garantizando que el almacenamiento local offline de la PWA no sufra de fugas o contaminaciones de datos confidenciales.

### 4.17. CRYPTOGRAPHY AND IDENTITY HASHING
* **Análisis Técnico**: Se auditó la protección criptográfica de la información confidencial de los usuarios (como Cédula de Identidad de Venezuela, contraseñas, y datos bancarios de Pago Móvil).
* **Resultado**: **PASS**. 
  - Los canales de datos en tránsito se encuentran protegidos bajo cifrado TLS fuerte (HTTPS / WSS) forzado por los certificados del navegador y la red de Supabase.
  - Las contraseñas de acceso de Supabase Auth se encriptan bajo algoritmos de derivación de claves estándar de la industria (Bcrypt / Argon2id).
  - La Cédula de Identidad, dato sensible de unicidad para prevención de registros múltiples, nunca es almacenada en texto plano. En su lugar, el servidor calcula un hash criptográfico SHA-256 irreversible (`cedula_hash`) que garantiza la unicidad y consistencia de la identidad sin exponer el documento, registrando únicamente una máscara segura (`V-***456`) para la visualización administrativa en la interfaz del usuario.

### 4.18. SECURITY HEADERS
* **Análisis Técnico**: Las cabeceras de seguridad protegen a los usuarios contra secuestros de clickjacking y ataques de sniffing de contenido basados en MIME.
* **Resultado**: **PASS**. Las peticiones servidas a través del API de Supabase y las páginas de alojamiento inyectan de manera correcta directivas de seguridad modernas. Se configuró en el indexador la cabecera `referrer-policy` para evitar que las URLs de redirección o recursos externos recopilen información del contexto de navegación de la aplicación de juegos. La renderización dentro de marcos de origen cruzado (Clickjacking) se encuentra bloqueada a través de las directivas declaradas en el iframe del cliente.

---

## 5. RECOMENDACIONES DE MEJORA Y PRÓXIMOS PASOS

A pesar de que el estado de la plataforma es altamente seguro y resistente (0 Vulnerabilidades Críticas/Altas activas), se recomienda planificar las siguientes mejoras de endurecimiento secundario en fases posteriores:

1. **Migrar Rate Limiting a Capa Edge**: Implementar un middleware en Supabase Edge Functions que interactúe con una base de datos en memoria ultrarrápida (como Redis / Upstash) para realizar el control de tasa limitadora (rate limit) de manera asíncrona en el borde, descongestionando los recursos de procesamiento transaccional del motor PostgreSQL y previniendo ataques de denegación de servicio (DoS) a nivel de base de datos.
2. **Implementar Nonces en CSP**: Eliminar por completo la directiva `'unsafe-inline'` del Content Security Policy mediante la adopción de tokens de un solo uso (nonces) generados dinámicamente por un proxy o CDN inverso en la entrada de las peticiones estáticas de la plataforma.
3. **Ofuscación de Código de Producción**: Integrar un plugin de ofuscación de código avanzado (como `javascript-obfuscator`) en el flujo de compilación de Vite para dificultar los esfuerzos de ingeniería inversa en caliente y análisis estático de las firmas RPC por parte de atacantes sobre el navegador.
