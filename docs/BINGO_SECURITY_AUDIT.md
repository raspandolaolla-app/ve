# 🔴 AUDITORÍA DE SEGURIDAD OFENSIVA — BINGO VIRTUAL RASPANDO LA OLLA / PULSOPLAY

**Fecha de la Auditoría:** 30 de Agosto de 2026  
**Auditor:** AI Offensive Security Agent  
**Objetivo:** Evaluar la seguridad, integridad y resiliencia del motor multimodal de Bingo (75, 80 y 90 Bolas) y la base de datos Supabase/PostgreSQL.

---

## RESUMEN DE HALLAZGOS

| Severidad | Cantidad | Descripción General | Requiere Cambios |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | **2** | Bypass de escritura directo en el estado de juego y manipulación arbitraria de precios. | Migración SQL (RLS + RPC) |
| **HIGH** | **6** | Elisión de rol de host en sorteos públicos, fuga de historial, re-compra infinita, e ignorancia silenciosa de cartones en compras múltiples. | Migración SQL (RPC + RLS) |
| **MEDIUM** | **0** | No se encontraron brechas de severidad media. | - |
| **LOW** | **0** | No se encontraron brechas de severidad baja. | - |
| **PASS** | **6** | Criptografía de cartones, seguridad de saldos por concurrencia, privacidad de cartones de rivales, y cálculos de premios. | Ninguno |

---

# DETALLE DE HALLAZGOS POR SEVERIDAD

## 🔴 HALLAZGOS CRÍTICOS (CRITICAL)

### CRITICAL-01: Modificación Directa del Estado de Sesión en el Cliente (Direct SQL Update Bypass)
*   **Vulnerability:** Las políticas de Row-Level Security (RLS) para la tabla `public.game_sessions` permiten que cualquier jugador activo de la mesa envíe un comando SQL `UPDATE` directamente desde la API cliente de Supabase (PostgREST) y altere el JSON de `current_state`.
*   **Componente Afectado:** Tabla `public.game_sessions` (Políticas RLS `p_sessions_update` y `p_sessions_insert`).
*   **Impacto:** **CRÍTICO.** Un usuario malicioso puede alterar directamente la lista de balotas extraídas (`drawnBalls`) agregando los números de sus propios cartones, o reescribir directamente el `winnerUserId` y `winnerPoolBs` en la base de datos. Puesto que el verificador `rpc_claim_bingo_secure` confía en las balotas almacenadas en el estado de la sesión, el atacante puede forzar victorias automáticas y vaciar los fondos financieros del pozo del juego.
*   **Método de Reproducción:**
    1. Unirse a una mesa activa.
    2. En la consola del desarrollador del navegador, ejecutar:
       ```javascript
       const cardNumbers = [7, 14, 21, 28, 35, 42, 49, 56, 63, 70, 1, 2, 3, 4, 5]; // Números de su propio cartón
       await supabase
         .from('game_sessions')
         .update({
           current_state: {
             variant: '90',
             status: 'in_progress',
             drawnBalls: cardNumbers,
             totalBalls: 90
           }
         })
         .eq('id', 'session_id');
       ```
    3. Invocar la RPC `rpc_claim_bingo_secure(session_id)`.
    4. El servidor valida la victoria basándose en la lista inyectada de `drawnBalls` y acredita el dinero.
*   **Evidencia:** Archivo `/supabase/migrations/018_game_engine_realtime_and_rls.sql`, línea 19:
    ```sql
    CREATE POLICY p_sessions_update ON public.game_sessions
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.game_table_players p
          WHERE p.table_id = game_sessions.table_id AND p.user_id = auth.uid()
        )
      );
    ```
*   **Recomendación:** Eliminar los permisos de `INSERT` y `UPDATE` para usuarios autenticados en la tabla `game_sessions`. El estado de la partida solo debe ser actualizable a través de RPC seguras del lado del servidor con `SECURITY DEFINER` (o reservado exclusivamente a roles operativos).
*   **Requiere Migración:** SÍ  
*   **Requiere RPC:** NO  
*   **Requiere RLS:** SÍ  
*   **Requiere Frontend:** NO

---

### CRITICAL-02: Precio Arbitrario del Cartón Controlado por el Cliente (Arbitrary Pricing Vulnerability)
*   **Vulnerability:** En la función de compra `buy_bingo_cards_secure`, el precio unitario del cartón se toma del parámetro del cliente `p_price_per_card` usando un `COALESCE`. No existe validación cruzada para asegurar que este parámetro coincida con el precio real configurado en la mesa (`entry_fee`).
*   **Componente Afectado:** RPC `public.buy_bingo_cards_secure`.
*   **Impacto:** **CRÍTICO.** Un usuario puede inyectar un precio de `0.01` Bs o `0.00` Bs en la solicitud de compra, logrando adquirir el máximo de 20 cartones gratis o por fracciones de centavo, mientras que el sistema procesa su participación de forma legítima y con cartones 100% válidos.
*   **Método de Reproducción:**
    Enviar una petición de compra manipulando el precio unitario:
    ```javascript
    await supabase.rpc('buy_bingo_cards_secure', {
      p_game_table_id: 'table_uuid',
      p_card_count: 20,
      p_variant: '75',
      p_price_per_card: 0.01
    });
    ```
    El servidor calculará `v_total_cost := 0.20 Bs` (en lugar de `200.00 Bs`), deducirá ese ínfimo monto de la billetera y le otorgará 20 cartones listos para cantar Bingo.
*   **Evidencia:** Archivo `/supabase/migrations/065_bingo_virtual_sorteo_system.sql`, línea 320:
    ```sql
    v_total_cost := ROUND(p_card_count * COALESCE(p_price_per_card, v_table.entry_fee, 10.00), 2);
    ```
*   **Recomendación:** Eliminar por completo el parámetro `p_price_per_card` de la firma de la función RPC. Forzar de forma inmutable el uso de `v_table.entry_fee` consultado directamente de la tabla `game_tables` bloqueada.
*   **Requiere Migración:** SÍ  
*   **Requiere RPC:** SÍ (Modificar firma y cuerpo)  
*   **Requiere RLS:** NO  
*   **Requiere Frontend:** SÍ (Adaptar llamada al API eliminando el argumento de precio)

---

## 🟡 HALLAZGOS DE SEVERIDAD ALTA (HIGH)

### HIGH-01: Evasión de Permiso de Host en Mesas Públicas de Sorteo Automatizado
*   **Vulnerability:** El control de extracción de balotas en `rpc_draw_bingo_ball_secure` restringe la operación usando el operador `<>` contra `host_user_id`. Sin embargo, en las mesas automáticas del lobby, `host_user_id` es `NULL`. En SQL, cualquier comparación de desigualdad contra `NULL` (`NULL <> user_id`) resulta en `NULL` (falso/desconocido), por lo que la condición `IF ... THEN` es saltada por completo.
*   **Componente Afectado:** RPC `public.rpc_draw_bingo_ball_secure`.
*   **Impacto:** **ALTO.** Cualquier jugador autenticado puede llamar directamente al endpoint `rpc_draw_bingo_ball_secure` en sorteos públicos automáticos y extraer balotas de forma descontrolada a la velocidad de la red, saltándose el intervalo de 3.5 segundos y arruinando la experiencia de juego de todos los demás participantes.
*   **Método de Reproducción:**
    Llamar repetidamente a la función en un bucle:
    ```javascript
    for (let i = 0; i < 75; i++) {
      await supabase.rpc('rpc_draw_bingo_ball_secure', { p_session_id: 'automated_session_uuid' });
    }
    ```
    El servidor devolverá éxito para cada llamada y rellenará la balotera instantáneamente sin control de tiempo ni de autoridad.
*   **Evidencia:** Archivo `/supabase/migrations/068_bingo_la_olla_master_upgrade.sql`, línea 533:
    ```sql
    IF v_table.host_user_id <> v_user_id THEN
    ```
*   **Recomendación:** Usar el operador `IS DISTINCT FROM` que maneja valores nulos de forma segura:
    ```sql
    IF v_table.host_user_id IS DISTINCT FROM v_user_id THEN
    ```
    Además, para mesas de sorteo automático (donde `host_user_id` es nulo), se debe prohibir de forma absoluta que cualquier cliente manual invoque este endpoint, reservando la extracción exclusivamente a un agente automatizado del sistema o validador central.
*   **Requiere Migración:** SÍ  
*   **Requiere RPC:** SÍ  
*   **Requiere RLS:** NO  
*   **Requiere Frontend:** NO

---

### HIGH-02: Escritura y Alteración Abierta de Historial de Ganadores (RLS Loose Policy)
*   **Vulnerability:** La política RLS `p_bingo_winner_history_all` otorga permisos completos de escritura (`INSERT`, `UPDATE`, `DELETE`) sobre el historial público de ganadores a cualquier usuario autenticado de la plataforma.
*   **Componente Afectado:** Tabla `public.bingo_winner_history`.
*   **Impacto:** **ALTO.** Un usuario malicioso puede inyectar registros falsificados de ganadores con premios multimillonarios, borrar el historial legítimo de otros jugadores o sabotear la tabla pública de logros/social feeds.
*   **Método de Reproducción:**
    ```javascript
    await supabase.from('bingo_winner_history').insert({
      session_id: 'session_uuid',
      user_id: 'my_user_id',
      winner_name: 'HACKER ADINERADO',
      prize_bs: 999999.99
    });
    ```
    La operación es aceptada por la base de datos debido a la regla `USING (true) WITH CHECK (true)`.
*   **Evidencia:** Archivo `/supabase/migrations/068_bingo_la_olla_master_upgrade.sql`, línea 27:
    ```sql
    CREATE POLICY p_bingo_winner_history_all ON public.bingo_winner_history
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    ```
*   **Recomendación:** Reemplazar esta política para permitir únicamente la consulta (`SELECT`) a usuarios autenticados. Las operaciones de inserción o limpieza del historial deben ejecutarse exclusivamente por funciones del servidor con privilegios elevados (`SECURITY DEFINER`).
*   **Requiere Migración:** SÍ  
*   **Requiere RPC:** NO  
*   **Requiere RLS:** SÍ  
*   **Requiere Frontend:** NO

---

### HIGH-03: Omisión del Límite Acumulado de Cartones (Infinite Card Purchases)
*   **Vulnerability:** `buy_bingo_cards_secure` restringe que no se compren más de 20 cartones *en una sola transacción*, pero omite verificar si el usuario ya posee cartones previamente adquiridos en transacciones anteriores para la misma mesa de juego.
*   **Componente Afectado:** RPC `public.buy_bingo_cards_secure`.
*   **Impacto:** **ALTO.** Un usuario puede burlar el límite reglamentario de 20 cartones llamando a la RPC sucesivamente en lotes de 20 (por ejemplo, acumulando 100 o 500 cartones), incrementando exponencialmente sus probabilidades estadísticas de victoria frente a jugadores limpios.
*   **Método de Reproducción:**
    Ejecutar tres llamadas consecutivas en la misma mesa:
    ```javascript
    await supabase.rpc('buy_bingo_cards_secure', { p_game_table_id: 'table_id', p_card_count: 20, p_variant: '75' });
    await supabase.rpc('buy_bingo_cards_secure', { p_game_table_id: 'table_id', p_card_count: 20, p_variant: '75' });
    await supabase.rpc('buy_bingo_cards_secure', { p_game_table_id: 'table_id', p_card_count: 20, p_variant: '75' });
    ```
    El servidor autoriza la compra de 60 cartones en total sin lanzar alertas.
*   **Evidencia:** Ausencia total de agregación y conteo sobre compras previas en `public.bingo_card_purchases`.
*   **Recomendación:** Añadir un control selectivo que sume las compras previas del usuario y bloquee la transacción si el total acumulado excede de 20:
    ```sql
    SELECT COALESCE(SUM(card_count), 0) INTO v_already_owned
    FROM public.bingo_card_purchases
    WHERE game_table_id = p_game_table_id AND user_id = v_user_id;

    IF v_already_owned + p_card_count > 20 THEN
      RETURN jsonb_build_object('success', false, 'error', 'EXCEDE_MAXIMO_DE_20_CARTONES_ACUMULADOS');
    END IF;
    ```
*   **Requiere Migración:** SÍ  
*   **Requiere RPC:** SÍ  
*   **Requiere RLS:** NO  
*   **Requiere Frontend:** NO

---

### HIGH-04: Ignorancia Silenciosa de Cartones en Compras Múltiples (Multi-Purchase Loss)
*   **Vulnerability:** Durante el reclamo de victoria en `rpc_claim_bingo_secure`, el motor del servidor obtiene los cartones del usuario ejecutando un `LIMIT 1` ordenado por fecha de creación descendente.
*   **Componente Afectado:** RPC `public.rpc_claim_bingo_secure`.
*   **Impacto:** **ALTO (Vulnerabilidad lógica y de experiencia).** Si un jugador realiza compras fragmentadas (ej. compra 5 cartones y luego otros 5 cartones), el servidor solo analizará la última transacción (`LIMIT 1`). Si una combinación ganadora se completó en uno de los cartones del primer lote, la verificación fallará retornando falsamente `CANTO_FALSO` y privando al usuario de un cobro legítimo.
*   **Método de Reproducción:**
    1. Comprar 5 cartones (Transacción A).
    2. Comprar 5 cartones (Transacción B).
    3. Un cartón de la Transacción A se completa con las balotas extraídas en la balotera.
    4. Invocar `rpc_claim_bingo_secure`.
    5. El servidor responde con error `CANTO_FALSO` porque solo inspeccionó los cartones de la Transacción B.
*   **Evidencia:** Archivo `/supabase/migrations/068_bingo_la_olla_master_upgrade.sql`, línea 265:
    ```sql
    SELECT * INTO v_purchase
    FROM public.bingo_card_purchases
    WHERE game_table_id = v_session.table_id AND user_id = v_user_id
    ORDER BY created_at DESC
    LIMIT 1;
    ```
*   **Recomendación:** Iterar y evaluar todos los cartones de todas las transacciones realizadas por el usuario para esa mesa, en lugar de restringir la búsqueda a un solo registro.
*   **Requiere Migración:** SÍ  
*   **Requiere RPC:** SÍ  
*   **Requiere RLS:** NO  
*   **Requiere Frontend:** NO

---

### HIGH-05: Falta de Idempotencia en la Compra de Cartones (Replay & Double-Spend Hazard)
*   **Vulnerability:** El endpoint `buy_bingo_cards_secure` no valida ningún token o clave de idempotencia (`idempotency_key`) proveniente del cliente.
*   **Componente Afectado:** RPC `public.buy_bingo_cards_secure`.
*   **Impacto:** **ALTO.** En situaciones de inestabilidad de red (donde el cliente reintenta llamadas HTTP erróneas) o por clics rápidos maliciosos, el servidor procesará la compra múltiples veces, generando débitos duplicados y cargos injustificados en la billetera del usuario.
*   **Método de Reproducción:**
    Enviar la misma solicitud de red repetidamente en un intervalo corto. El sistema generará múltiples compras, debitará la billetera y creará filas distintas en el historial de ledgers.
*   **Evidencia:** La firma del método no acepta claves de idempotencia y genera el ledger de manera interna basándose en una clave aleatoria secuencial autogenerada posterior al insert.
*   **Recomendación:** Agregar un parámetro `p_idempotency_key` a la firma del endpoint y verificar previamente su existencia en `public.wallet_ledgers` o en un registro de peticiones antes de descontar saldos o generar cartones.
*   **Requiere Migración:** SÍ  
*   **Requiere RPC:** SÍ  
*   **Requiere RLS:** NO  
*   **Requiere Frontend:** SÍ (Modificar API cliente para inyectar una clave de idempotencia única)

---

### HIGH-06: Compra con Variante Desacoplada de la Mesa (Mismatched State Corruption)
*   **Vulnerability:** `buy_bingo_cards_secure` recibe una variante como parámetro (`p_variant`) y genera los cartones basados en ella sin corroborar si coincide con el modo oficial configurado en la mesa (`v_table.config->>'variant'`).
*   **Componente Afectado:** RPC `public.buy_bingo_cards_secure`.
*   **Impacto:** **ALTO.** Un atacante puede comprar cartones de la variante 90 en una mesa configurada en la modalidad 75. El sistema generará números del 1 al 90 en el cartón, pero como la balotera de 75 nunca extraerá balotas por encima del número 75, esos casilleros quedarán huérfanos e imposibles de marcar, corrompiendo lógicamente la sesión de juego.
*   **Método de Reproducción:**
    Comprar cartones en una mesa de modo 75 enviando el parámetro `p_variant := '90'`. La compra tiene éxito, pero los cartones devuelven números inválidos fuera del rango oficial del juego.
*   **Evidencia:** Falta de aserción entre `p_variant` y `v_table.config->>'variant'`.
*   **Recomendación:** Forzar que la variante se consulte de manera directa desde la mesa activa, ignorando cualquier variante arbitraria enviada por el cliente.
*   **Requiere Migración:** SÍ  
*   **Requiere RPC:** SÍ  
*   **Requiere RLS:** NO  
*   **Requiere Frontend:** NO

---

# 🟢 PRUEBAS DE SEGURIDAD QUE RESULTARON EXITOSAS (PASS)

### PASS-01: Protección Contra Suplantación de Identidad (User Impersonation)
*   **Resultado:** **EXITOSO.** La base de datos obtiene de forma estricta el identificador de usuario invocando `auth.uid()`. Ningún parámetro de entrada de usuario (`user_id`) provisto por el cliente es aceptado o utilizado para la compra de cartones o reclamo de premios, impidiendo que un atacante compre cartones en nombre de otra persona.

### PASS-02: Doble Gasto y Concurrencia de Fondos (Double Spending Protection)
*   **Resultado:** **EXITOSO.** Las transacciones de compra y descuento de billetera ejecutan bloqueos atómicos pesimistas de lectura/escritura (`FOR UPDATE`) sobre la fila del monedero del usuario en `public.wallets`. Los intentos de compra concurrentes simultáneos son debidamente encolados y rechazados por saldo insuficiente si los fondos se agotan.

### PASS-03: Control de Ventana Temporal (Post-Close Purchase Block)
*   **Resultado:** **EXITOSO.** El servidor bloquea de forma rígida la adquisición de cartones en los últimos 10 segundos del countdown y rechaza cualquier compra si la partida ya ha comenzado (estado `ACTIVE`), evitando que los jugadores compren cartones habiendo visto las primeras balotas del sorteo.

### PASS-04: Privacidad de Cartones de Oponentes (Card Scraping Defeat)
*   **Resultado:** **EXITOSO.** La directiva RLS en `public.bingo_card_purchases` restringe la visibilidad de los registros de compra estrictamente a su propietario mediante la regla `auth.uid() = user_id`. Ningún jugador rival puede inspeccionar el estado o números de cartones ajenos para anticipar victorias.

### PASS-05: Autoridad en la Generación de Cartones (Server Card Authority)
*   **Resultado:** **EXITOSO.** Los cartones son generados estrictamente en el backend utilizando `generate_single_bingo_card_jsonb` y calculando hashes SHA256 criptográficos. El parámetro opcional `p_cards_data` provisto por el cliente es ignorado por completo, bloqueando intentos de inyección de cartones manipulados.

### PASS-06: Cálculos de Premios e Integridad de Liquidación (Financial Calculus Security)
*   **Resultado:** **EXITOSO.** El premio de la victoria, las comisiones de la plataforma y la distribución de saldos son calculados de forma inmutable en el backend mediante la suma de las ventas reales en la tabla de compras, eliminando cualquier intervención o reporte financiero originado en el cliente.

---

# 📋 RESUMEN DE ATAQUES

| Tipo de Ataque | Estado del Ataque | Descripción Técnica / Defensa |
| :--- | :--- | :--- |
| **Compra con Cantidad Negativa / 0** | **BLOQUEADO (PASS)** | Controlado correctamente por la restricción `CHECK (card_count BETWEEN 1 AND 20)` en la base de datos y validaciones locales en la RPC. |
| **Inyección de Precio Alterado** | **VULNERABLE (ÉXITO)** | El atacante logra fijar el costo unitario del cartón en `0.01` debido al `COALESCE` desprotegido. |
| **Manipulación Directa del Estado del Sorteo** | **VULNERABLE (ÉXITO)** | Las directivas RLS sueltas en `game_sessions` permiten reescribir la lista de balotas jugadas en tiempo real. |
| **Doble Reclamo Simultáneo de Bingo** | **BLOQUEADO (PASS)** | Controlado mediante exclusión mutua por `FOR UPDATE` sobre la fila del sorteo en la tabla `game_sessions`. |
| **Recompra Infinita Superior a 20** | **VULNERABLE (ÉXITO)** | No se comprueba el histórico de compras acumuladas para una mesa específica. |
| **Suplantación de Usuario Comprador** | **BLOQUEADO (PASS)** | La base de datos confía únicamente en el token criptográfico firmado (`auth.uid()`). |
| **Falsificación de Ganador de Bingo** | **VULNERABLE (ÉXITO)** | La política incondicional `p_bingo_winner_history_all` permite reescribir libremente el feed público de ganadores. |
| **Pérdida de Cartones en Compras Múltiples** | **VULNERABLE (ÉXITO)** | El uso estricto de `LIMIT 1` descarta silenciosamente los lotes previos de cartones en la verificación de victoria. |

---

# 🛡️ PROPUESTA DE MITIGACIÓN (PLAN DE REPARACIÓN)

*Como se ha estipulado en las reglas absolutas, no se aplicarán modificaciones de código hasta recibir la instrucción expresa del usuario.*

Un resumen técnico del parche correctivo incluirá:
1.  **Parche RLS `game_sessions`:** Limitar accesos de actualización únicamente a operadores del sistema o funciones autorizadas (`SECURITY DEFINER`).
2.  **Parche RLS `bingo_winner_history`:** Impedir inserciones y actualizaciones manuales desde el rol `authenticated`.
3.  **Remodelación `buy_bingo_cards_secure`:**
    *   Retirar parámetros manipulables (`p_price_per_card`, `p_cards_data`).
    *   Incorporar control acumulativo de compras máximas de cartones.
    *   Inyectar validación estricta de variante de mesa.
    *   Soportar idempotencia por cliente.
4.  **Remodelación `rpc_claim_bingo_secure`:**
    *   Soportar agregación JSONB para validar múltiples transacciones de compra legítimas.
