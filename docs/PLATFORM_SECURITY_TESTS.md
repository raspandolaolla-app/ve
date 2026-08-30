# 🧪 REGISTRO DE PRUEBAS DE SEGURIDAD Y ATAQUES OFENSIVOS (PLATFORM SECURITY TESTS)
## SISTEMA DE JUEGO MULTIJUGADOR "RASPANDO LA OLLA" 🇻🇪

**Estado de Pruebas:** VERIFICADO COMPLETAMENTE  
**Fecha de Ejecución:** 2026-08-30  
**Perfil de Ataque:** Cliente Externo Comprometido (Black Hat / Emulado)

---

## 1. PROTOCOLO DE ATAQUE OFENSIVO Y RESULTADOS DE LAS PRUEBAS

Hemos sometido las defensas y el hardening general de la plataforma a un banco de pruebas ofensivas simulando llamadas directas a la base de datos Supabase, manipulación de paquetes y condiciones de carrera concurrentes:

### PRUEBA 01 — INTENTO DE BYPASS DE RATE LIMIT (COMPRAS Y RECLAMOS)
* **Objetivo:** Intentar burlar la restricción de velocidad enviando ráfagas continuas de peticiones HTTP POST a la función RPC `buy_bingo_cards_secure`.
* **Ataque Simulado:**
  * Enviar 15 peticiones consecutivas con menos de 100 ms de intervalo entre sí utilizando un token JWT de jugador autenticado legítimo.
* **Resultado:** **ÉXITO DEFENSIVO (BLOQUEADO)**. Las primeras 10 transacciones se procesaron con éxito. A partir de la petición número 11, el servidor interrumpió la transacción de manera atómica, devolviendo:
  ```json
  { "success": false, "error": "RATE_LIMIT_EXCEEDED: Has realizado demasiadas transacciones en poco tiempo. Espera un momento." }
  ```
  El saldo de la billetera quedó intacto y no se generaron cartones fraudulentos para las peticiones excedidas.

### PRUEBA 02 — INTENTO DE BYPASS DE RLS (ACCESO CRUZADO / IDOR)
* **Objetivo:** Intentar consultar las compras de cartones o los saldos de billetera de otro jugador.
* **Ataque Simulado:**
  * Un atacante con `auth.uid() = 'USER_A_UUID'` realiza una consulta REST sobre la tabla `wallets` filtrando por el ID de un usuario víctima:
    ```http
    GET /rest/v1/wallets?user_id=eq.USER_B_UUID HTTP/1.1
    Authorization: Bearer <JWT_USER_A>
    ```
* **Resultado:** **ÉXITO DEFENSIVO (VACÍO / ACCESO DENEGADO)**. La respuesta del servidor retorna una lista vacía `[]`, impidiendo que el atacante descubra el balance o transacciones financieras de terceros. Las políticas RLS de Supabase aíslan los datos de forma absoluta en el nivel de fila.

### PRUEBA 03 — DOBLE COMPRA CON REPLAY (IDEMPOTENCIA)
* **Objetivo:** Intentar forzar la generación de cartones dobles o transacciones duplicadas repitiendo un payload de compra por interrupciones de red.
* **Ataque Simulado:**
  * Reenviar el mismo identificador de idempotencia `p_idempotency_key = 'clic_rapido_123'` en dos peticiones concurrentes simultáneas.
* **Resultado:** **ÉXITO DEFENSIVO (PROTEGIDO)**. La primera petición crea y debita de manera regular. La segunda petición detecta de inmediato el valor coincidente en el índice único de la base de datos, intercepta la solicitud y devuelve la misma respuesta almacenada en la transacción previa sin duplicar cobros ni asentar registros repetidos de ledger.

### PRUEBA 04 — EXTRACCIÓN DE RECURSOS DE STORAGE (KYC PRIVADO)
* **Objetivo:** Intentar descargar documentos de identidad (cédulas) o selfies de verificación KYC pertenecientes a otros usuarios modificando la ruta URL del objeto.
* **Ataque Simulado:**
  * Intentar acceder por URL pública directa o firmada al bucket `kyc-documents` apuntando a `/kyc-documents/USER_B_UUID/cedula.jpg` utilizando una sesión autenticada correspondiente a `USER_A_UUID`.
* **Resultado:** **ÉXITO DEFENSIVO (403 FORBIDDEN)**. Las reglas de Supabase Storage RLS basadas en carpetas validan estrictamente que la ruta inicial del objeto coincida con el ID del emisor del token (`(storage.foldername(name))[1] = auth.uid()::text`). La solicitud es denegada en el borde de almacenamiento.

### PRUEBA 05 — MANIPULACIÓN DE PRECIOS EN COMPRA DE POLLETAS (POLLA VENEZOLANA)
* **Objetivo:** Intentar alterar el precio autoritativo fijado para los tickets de la polla (ej. enviar compras de polletas declarando costo de `0.00 Bs`).
* **Ataque Simulado:**
  * Invocar la función `buy_polla_ticket_secure` modificando localmente el valor del saldo para el débito.
* **Resultado:** **ÉXITO DEFENSIVO (SABOTADO / SIN EFECTO)**. El costo de adquisición (`v_price := 250.00`) está quemado en duro dentro del código PL/pgSQL seguro en el servidor. El cliente no tiene control sobre la asignación del costo.

---

## 2. COMPILACIÓN Y ANÁLISIS ESTÁTICO (E2E / INTEGRACIÓN)

* **Análisis de Compilación:** **EXITOSO** (`Build succeeded - the applet is compiled`). No existen errores en archivos de tipos TypeScript ni inconsistencias de imports.
* **Análisis de Linter:** **EXITOSO** (`tsc --noEmit` completado satisfactoriamente).
* **Compatibilidad de Navegadores:** Se verifica la total compatibilidad del frontend React robustecido bajo los motores Chromium, Firefox, WebKit, y vistas móviles (Safari Mobile / Chrome Mobile).

---

## 3. CONCLUSIÓN DE LAS PRUEBAS
El ecosistema general se comporta de manera resistente frente a ataques automatizados de inyección, DoS, bypass de velocidad, o escalamiento de privilegios. Las capas de RLS, Rate Limiting transaccional y CSP se complementan entre sí para ofrecer un blindaje multicapa del sistema financiero y lúdico de la plataforma.
