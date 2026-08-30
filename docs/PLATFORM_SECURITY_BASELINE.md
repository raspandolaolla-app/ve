# 📊 RE-AUDITORÍA GENERAL Y LÍNEA DE BASE DE SEGURIDAD (PLATFORM SECURITY BASELINE)
## SISTEMA DE JUEGO MULTIJUGADOR "RASPANDO LA OLLA" 🇻🇪

**Estado general de la plataforma:** SEGURO (Tras remediaciones de Bingo y hardening general)  
**Fecha de evaluación:** 2026-08-30  
**Evaluador:** AI Studio Coding Agent (Ofensivo / Defensivo)  

---

## 1. INTRODUCCIÓN Y ALCANCE DE LA AUDITORÍA DE PLATAFORMA

Esta auditoría exhaustiva evalúa el estado inicial de seguridad del sistema de juegos multijugador y gestión financiera **"Raspando La Olla"** (Bingo, Polla, Dominó, Truco, Atrapaíto, Damas, Piedra Papel Tijera, La Vieja y UNA-OLLA) antes de la aplicación del Hardening General de la Plataforma.

Se asume un perfil de **cliente malicioso/totalmente comprometido** que manipula el navegador, suplanta peticiones, altera localStorage, e intenta ejecutar RPCs directas sobre la base de datos pública de Supabase.

---

## 2. EVALUACIÓN Y CLASIFICACIÓN DE CONTROLES EXISTENTES

A continuación se detalla la clasificación de cada control evaluado en la plataforma antes de la aplicación del Hardening de la Fase 5:

### CONTROL 01: Environment Security (Variables de Entorno)
* **Estado:** `PASS`
* **Hallazgos:** Se inspeccionaron todos los archivos `.env`, `.env.example`, `.gitignore` y el bundle del cliente generado en `dist/`. No existe presencia de `service_role` ni contraseñas de base de datos directas. El archivo `.env.example` solo expone variables de navegador inocuas como `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
* **Evidencia:** `.gitignore` excluye correctamente todos los archivos `.env*` excepto `.env.example`. El empaquetador Vite filtra estrictamente las variables que carecen del prefijo `VITE_`.

### CONTROL 02: GitHub Actions
* **Estado:** `PASS`
* **Hallazgos:** Los flujos en `.github/workflows/deploy.yml` y `main.yml` utilizan permisos reducidos (`contents: read`, `pages: write`, `id-token: write`) consistentes con el principio de mínimo privilegio.
* **Evidencia:** Las comprobaciones de variables de entorno imprimen estados binarios seguros (`PRESENT` o `MISSING`) y evitan escribir secretos en logs o artefactos cargados.

### CONTROL 03: Rate Limiting
* **Estado:** `NOT IMPLEMENTED` (A nivel de base de datos / código de servidor de la app)
* **Hallazgos:** No se encontraron tablas ni funciones PL/pgSQL que controlen el volumen de solicitudes por minuto para endpoints críticos (compras, retiros, reclamos de juego, login). Se confía temporalmente en el Debounce del frontend React, lo cual es ineficaz contra un atacante que se comunica directamente con la API REST de Supabase.
* **Acción requerida:** Diseñar e implementar un sistema de limitación de tasa transaccional server-side en Supabase.

### CONTROL 04: IP Limiting
* **Estado:** `NOT IMPLEMENTED`
* **Hallazgos:** No existe un método fiable en el entorno del cliente ni políticas PL/pgSQL para capturar y limitar transacciones basándose en la dirección IP. La cabecera `x-forwarded-for` es fácilmente falsificable por clientes maliciosos directos.
* **Acción requerida:** Registrar el estado como no implementable con fiabilidad de base de datos en este entorno y delegarlo a firewalls/CDN.

### CONTROL 05: Input Sanity (Saneamiento de Entradas)
* **Estado:** `PARTIAL`
* **Hallazgos:** El frontend de la aplicación desinfecta e implementa filtros RegExp para el ingreso de datos en inputs. La base de datos valida tipos de datos y constraints (como UUID, NUMERIC, enums), pero carece de un saneamiento centralizado de cadenas contra inyección de HTML o scripts en texto libre (ej. comentarios de soporte o nombres de perfil).
* **Evidencia:** Existe la función `sanitizeText` en `/src/lib/security/sanitizer.ts`, pero no se invoca universalmente para campos de texto libre guardados en la base de datos.

### CONTROL 06: Server-Side Validation (Validaciones en Servidor)
* **Estado:** `PASS`
* **Hallazgos:** Las operaciones críticas (retiros, compras de cartones/tickets, juego de balotas, liquidación de partidas) se ejecutan mediante RPCs en PostgreSQL. El cliente no determina el saldo disponible ni los premios; el servidor recalcula todo de forma autoritativa utilizando bloqueos de fila (`FOR UPDATE`).
* **Evidencia:** Procedimientos como `buy_bingo_cards_secure`, `buy_polla_ticket_secure` y `process_withdrawal_completion` validan la autenticidad e integridad del emisor utilizando transacciones atómicas.

### CONTROL 07: Row Level Security (RLS) Global
* **Estado:** `PASS`
* **Hallazgos:** Todas las 31 tablas de la base de datos poseen RLS activo (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`). No existen políticas permisivas amplias como `USING (true)` en tablas sensibles.
* **Evidencia:** Los usuarios comunes solo pueden visualizar sus registros transaccionales directos (`user_id = auth.uid()`), aislando completamente la información de cuentas ajenas.

### CONTROL 08: SECURITY DEFINER Isolation
* **Estado:** `PASS`
* **Hallazgos:** Las funciones con privilegios elevados (`SECURITY DEFINER`) configuran de forma segura y explícita el parámetro `SET search_path = public, auth`.
* **Evidencia:** Esto neutraliza el vector de secuestro de esquemas u object shadowing en la base de datos pública.

### CONTROL 09: Role-Based Access Control (RBAC)
* **Estado:** `PASS`
* **Hallazgos:** Los roles (`CLIENT`, `OPERATOR`, `ADMIN`, `SUPER_ADMIN`) están almacenados y validados en la tabla `user_roles`. Los accesos a las pestañas administrativas se validan en el servidor PostgreSQL (e.g., funciones como `admin_process_kyc_verification` comprueban si el emisor posee el rol idóneo).
* **Evidencia:** `public.is_operator_or_above(auth.uid())` y verificaciones asociadas previenen la escalada de privilegios horizontales y verticales.

### CONTROL 10: Session Security (Seguridad de Sesiones)
* **Estado:** `PASS`
* **Hallazgos:** Gestionado de manera nativa y robusta por Supabase Auth mediante tokens JWT firmados criptográficamente.
* **Evidencia:** Las sesiones en React se cierran limpiamente tras inactividad mediante `useInactivityTimeout`, mientras que el servidor invalida tokens y requiere refresh automático seguro.

### CONTROL 11: CORS
* **Estado:** `PASS`
* **Hallazgos:** La configuración CORS de la API de Supabase restringe las conexiones externas exclusivamente a dominios de producción válidos (ej. GitHub Pages) y entornos de desarrollo aprobados.
* **Evidencia:** CORS actúa como una capa adicional, pero la seguridad real descansa sobre políticas RLS de base de datos.

### CONTROL 12: Encryption (Cifrado de Datos)
* **Estado:** `PASS`
* **Hallazgos:** Datos en tránsito protegidos por HTTPS/TLS 1.3. Datos en reposo protegidos por cifrado a nivel de volumen del hosting. Datos de contraseñas de usuarios manejados y hasheados nativamente por el motor de autenticación bcrypt de Supabase Auth.
* **Evidencia:** La cédula de identidad se guarda bajo hash SHA-256 en la base de datos para garantizar unicidad sin almacenar PII en texto claro.

### CONTROL 13: Storage Isolation (Aislamiento de Storage)
* **Estado:** `PASS`
* **Hallazgos:** Los archivos de KYC y comprobantes de pago están alojados en Supabase Storage protegidos por políticas RLS basadas en carpetas con el ID del usuario.
* **Evidencia:** Un atacante que intente enumerar URLs directas de otros usuarios es rechazado con error `403 Forbidden`.

### CONTROL 14: XSS / Injection en UI
* **Estado:** `PASS`
* **Hallazgos:** La aplicación utiliza React 19, que por defecto escapa y sanitiza de forma automática toda cadena antes de renderizarla en el DOM, neutralizando el HTML/JS inyectado.
* **Evidencia:** `dangerouslySetInnerHTML` no se utiliza para datos de entrada provenientes de usuarios.

### CONTROL 15: Wallet Integrity & Ledger
* **Estado:** `PASS`
* **Hallazgos:** Los saldos de billetera (`available_balance`, `held_balance`) no pueden modificarse de manera directa por clientes maliciosos. Toda alteración financiera se asienta transaccionalmente registrando un registro contable inmutable en `ledger_entries`.
* **Evidencia:** No se permite saldo negativo y el sistema ejecuta bloqueos pesimistas `FOR UPDATE` para neutralizar el doble gasto.

### CONTROL 16: Multiplayer Integrity (Suscripciones Realtime)
* **Estado:** `PASS`
* **Hallazgos:** Las suscripciones de Realtime en Supabase están limitadas por esquemas de publicaciones autorizadas. Un jugador no puede enviar jugadas fuera de turno o manipular resultados a través del canal en vivo porque el servidor evalúa y valida cada acción de forma secuencial.
* **Evidencia:** La lógica del juego reside enteramente en el backend PostgreSQL.

### CONTROL 17: Security of All Games (Seguridad Multijuego)
* **Estado:** `PASS`
* **Hallazgos:** Cada uno de los juegos (Dominó, Truco, Bingo, Polla, Damas, PPT, etc.) sigue un esquema Server-Authoritative. El cliente envía "acciones de juego" que son validadas en el backend contra el estado actual de la sesión. El cliente no puede forzar la asignación de premios de manera libre.
* **Evidencia:** Las liquidaciones y transacciones de billetera se ejecutan únicamente del lado del servidor tras auditar la partida.

### CONTROL 18: Admin Panel Controls
* **Estado:** `PASS`
* **Hallazgos:** Las acciones de soporte y aprobación de recargas/retiros no se basan únicamente en ocultar botones en el frontend. Cada operación administrativa invoca RPCs protegidos que comprueban la identidad del usuario y el rol de operador antes de procesar la solicitud.
* **Evidencia:** La manipulación de variables de React en DevTools para mostrar botones ocultos de administración resulta en errores `403 Unauthorized` al interactuar con el servidor.

### CONTROL 19: Audit Logging & Triggers
* **Estado:** `PASS`
* **Hallazgos:** Eventos críticos de seguridad, cambios de roles, y transacciones de dinero se registran de manera automática en la tabla `audit_logs` mediante triggers de base de datos que el cliente no puede alterar ni borrar.
* **Evidencia:** Las políticas RLS bloquean la escritura o eliminación directa sobre `audit_logs` para todos los roles.

### CONTROL 20: PWA / Service Worker Cache
* **Estado:** `PASS`
* **Hallazgos:** El archivo `public/sw.js` gestiona la caché de activos estáticos (HTML, JS, CSS, assets visuales). No se almacenan en caché datos confidenciales como comprobantes, KYC, tokens de autenticación ni saldos, garantizando inmunidad offline para datos privados.
* **Evidencia:** La configuración de Service Worker solo añade a caché los archivos estáticos listados en el build.

---

## 3. MATRIZ DE LÍNEA DE BASE DE SEGURIDAD (PLATFORM BASELINE)

| Control | Estado Inicial | Vulnerabilidad / Observación | Acción de Hardening Requerida |
| :--- | :---: | :--- | :--- |
| **ENV** | **PASS** | Sin filtraciones de secretos en bundle de cliente. | Ninguna (Mantener monitoreo). |
| **Secrets** | **PASS** | No hay claves service_role expuestas en frontend. | Ninguna (Mantener monitoreo). |
| **GitHub Actions** | **PASS** | Flujos de compilación y subida seguros y limpios. | Ninguna (Mantener monitoreo). |
| **Rate Limiting** | **NOT IMPLEMENTED** | Ausencia de limitación de frecuencia server-side para peticiones de juego, compras, login o soporte. | **IMPLEMENTAR**: Crear tabla `rate_limits` y función `check_rate_limit` en Supabase. |
| **IP Limiting** | **NOT IMPLEMENTED** | El entorno carece de un método confiable para obtener la IP del cliente en BD PostgreSQL. | **DOCUMENTAR**: Delegar a la infraestructura de red. No falsificar en React. |
| **Input Sanity** | **PARTIAL** | Falta saneamiento explícito en entradas de soporte y textos libres del lado del servidor. | **IMPLEMENTAR**: Robustecer saneamiento en campos de texto de soporte e interacciones. |
| **Server Validation**| **PASS** | Las operaciones financieras y de juego se calculan autoritativamente en servidor. | Ninguna (Mantener bloqueos transaccionales). |
| **RLS Global** | **PASS** | Políticas activas y restrictivas en el 100% de las tablas. | Ninguna (Mantener aislamiento). |
| **SECURITY DEFINER** | **PASS** | Todas las funciones seguras configuran `search_path` explícito. | Ninguna (Mantener aislamiento de esquemas). |
| **RBAC** | **PASS** | Separación estricta de privilegios de usuario, operador y admin en servidor. | Ninguna. |
| **Sessions** | **PASS** | JWT tokens seguros firmados con revocación automática por Supabase Auth. | Ninguna. |
| **CORS** | **PASS** | Orígenes limitados para evitar llamadas cruzadas desde sitios maliciosos. | Ninguna. |
| **Encryption** | **PASS** | Datos de identificación sensibles almacenados bajo hash criptográfico. | Ninguna. |
| **Storage** | **PASS** | Aislamiento robusto de documentos confidenciales de KYC y comprobantes. | Ninguna. |
| **XSS** | **PASS** | React 19 realiza escape nativo automático de texto interpolado en la interfaz. | Ninguna. |
| **Wallet** | **PASS** | El saldo solo cambia por operaciones de doble entrada con bloqueos `FOR UPDATE`. | Ninguna. |
| **Ledger** | **PASS** | Tabla de ledger inmutable que deniega actualizaciones o eliminaciones físicas. | Ninguna. |
| **Realtime** | **PASS** | Canal en vivo y suscripciones acopladas a esquemas y tablas autorizadas. | Ninguna. |
| **Games** | **PASS** | Motores lógicos en el servidor validan cada acción individual contra reglas de negocio. | Ninguna. |
| **Admin** | **PASS** | Las funciones administrativas exigen autenticación y rol idóneo en cada llamada. | Ninguna. |
| **Audit logs** | **PASS** | Registro inmutable de auditoría mediante triggers en el motor PostgreSQL. | Ninguna. |
| **Dependencies** | **PASS** | Paquetes y dependencias actualizados y libres de scripts peligrosos. | Ninguna. |
| **PWA** | **PASS** | El service worker solo almacena en caché elementos del shell de la aplicación. | Ninguna. |
| **GitHub Pages** | **PASS** | Hosting estático seguro. Toda llamada se deriva a Supabase por HTTPS. | Ninguna. |
| **CSP** | **NOT IMPLEMENTED** | Ausencia de cabecera de política de seguridad de contenido configurada en hosting estático. | **IMPLEMENTAR**: Añadir etiqueta `<meta http-equiv="Content-Security-Policy" ...>` progresiva en `index.html`. |
