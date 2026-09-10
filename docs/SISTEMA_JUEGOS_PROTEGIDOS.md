# 🔒 SISTEMA DE JUEGOS PROTEGIDOS / MÓDULOS CERTIFICADOS
**Proyecto:** RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)  
**Repositorio Canónico:** https://github.com/raspandolaolla-app/ve  
**Rama Oficial:** `main`  
**Fecha de Implementación:** 2026-09-10  
**Gobernanza:** DevOps, CI/CD, TypeScript, Supabase, GitHub Actions  

---

## 1. ¿QUÉ ES UN JUEGO PROTEGIDO?

Un **Juego Protegido** es un módulo de juego que ha superado exhaustivamente las pruebas de ciclo de vida (creación de mesa, uniones, turnos secuenciales, temporizadores, desconexión/reconexión, arbitraje de abandono y liquidación financiera) y cuyo código, componentes, motores, dependencias y contratos de base de datos han sido **congelados y certificados**.

### El Problema Eliminado: El Bucle Infinito de Regresiones
```text
CORREGIR JUEGO A
        ↓
modificar dependencia compartida (ej. GameRepository, GameContainer)
        ↓
ROMPER JUEGO B (ej. Ajedrez)
        ↓
corregir juego B
        ↓
modificar otra dependencia (ej. TurnTimer, RealtimeManager)
        ↓
ROMPER JUEGO C (ej. Truco)
        ↓
BUCLE INFINITO DE REGRESIONES
```

Con el Sistema de Juegos Protegidos, ningún cambio destinado a otro juego puede alterar o romper piezas certificadas.

---

## 2. ESTADOS DE PROTECCIÓN PERMITIDOS

| Estado | Significado y Política Operativa |
|---|---|
| `ACTIVE` | Juego en desarrollo activo. Puede ser modificado libremente. |
| `CAUTION` | Juego funcional pero con dependencias sensibles. Requiere análisis de regresión previo. |
| `STABLE` | Juego validado. No debe modificarse innecesariamente. |
| `LOCKED` | **Juego protegido contra cambios normales.** Bloqueo estricto por IA y scripts de verificación. |
| `HARD_LOCKED` | Protección máxima con gobernanza Git/GitHub (`.github/CODEOWNERS`) y checks obligatorios de CI. |
| `UNDER_REPAIR` | Juego desbloqueado explícitamente para reparación o mantenimiento autorizado. |

---

## 3. ¿CÓMO SE CONSULTA EL ESTADO Y LAS DEPENDENCIAS?

El sistema provee una herramienta de línea de comandos en TypeScript:

### Ver Estado General de Todos los Juegos:
```bash
npm run protected:status
# o:
npx tsx scripts/protected_games_guard.ts status
```

### Auditar Protección e Integridad:
```bash
npm run audit:protected
# o:
npx tsx scripts/protected_games_guard.ts audit
```
*Si todo está en orden, responde:*
```text
🔒 PROTECTION AUDIT
Ajedrez                       : [✓ PASS] (Estado: LOCKED)
Dominó Venezolano             : [✓ PASS] (Estado: LOCKED)
...
STATUS: SAFE
```

### Consultar Dependencias de un Juego Específico:
```bash
npx tsx scripts/protected_games_guard.ts deps ajedrez
```

### Búsqueda Inversa: ¿Qué Juegos Dependen de una Pieza Compartida?
```bash
npx tsx scripts/protected_games_guard.ts dependents GameRepository
npx tsx scripts/protected_games_guard.ts dependents GameContainer
npx tsx scripts/protected_games_guard.ts dependents TurnTimer
```

### Ver Matriz Transversal Completa:
```bash
npx tsx scripts/protected_games_guard.ts matrix
```

---

## 4. ¿QUÉ OCURRE SI UNA DEPENDENCIA COMPARTIDA ESTÁ PROTEGIDA?

Las siguientes dependencias son consideradas **Zona de Máximo Riesgo**:
- `src/services/repositories/GameRepository.ts` (10 juegos dependientes)
- `src/services/repositories/TableRepository.ts` (10 juegos dependientes)
- `src/features/games/components/GameContainer.tsx` (8 juegos dependientes)
- `src/features/games/components/TurnTimer.tsx` (8 juegos dependientes)
- `src/services/realtime/RealtimeManager.ts` (10 juegos dependientes)
- `src/features/games/useGameEngine.ts` (10 juegos dependientes)
- `src/features/games/engines/index.ts` (10 juegos dependientes)

### Regla Absoluta de Aislamiento:
Si se está corrigiendo un juego (ej. *Damas*) y se detecta que la solución implicaría alterar `GameContainer.tsx` o `GameRepository.ts`, pero *Ajedrez* o *Dominó* están `LOCKED`:
1. **NO modificar directamente la dependencia compartida.**
2. Crear una abstracción o sobrecarga local específica para el juego en desarrollo.
3. Si es estrictamente imposible aislar la solución, **DETENER EL CAMBIO** y requerir autorización formal para desbloquear los juegos dependientes.

---

## 5. PROCEDIMIENTO DE DESBLOQUEO (`UNDER_REPAIR`)

Para intervenir legítimamente un juego certificado:
```bash
npx tsx scripts/protected_games_guard.ts unlock ajedrez "Actualización de reglas de enroque y tablas por repetición"
```

Esto:
1. Cambia el estado a `UNDER_REPAIR`.
2. Registra la fecha, el usuario autor y el motivo formal.
3. **Conserva intacto el historial de certificación anterior** (commit de referencia y auditorías previas).

---

## 6. PROCEDIMIENTO DE RECERTIFICACIÓN Y BLOQUEO (`LOCKED`)

Una vez culminada la reparación, **NO** se vuelve a marcar como `LOCKED` de inmediato. Se debe cumplir la siguiente secuencia:

1. **Pruebas de Ciclo de Vida del Juego:**
   - Creación de mesa y asientos.
   - Alternancia y rotación de turnos.
   - Detección de ganador y empate.
   - Timeout y abandono forzoso.
   - Sincronización Realtime y reconexión.
   - Liquidación financiera.
2. **Pruebas de Regresión Transversal:**
   - Ejecutar suite consolidada: `npx tsx src/tests/run_all.ts`.
3. **Verificación Estática:**
   - `npm run typecheck` (0 errores).
   - `npm run lint` (0 errores).
   - `npm run build` (Build exitoso).
4. **Ejecutar Comando de Certificación:**
   ```bash
   npx tsx scripts/protected_games_guard.ts protect ajedrez
   ```
5. **Auditar:**
   ```bash
   npm run audit:protected
   ```

---

## 7. INTEGRACIÓN CON GITHUB ACTIONS Y CI/CD

En el flujo de despliegue `.github/workflows/main.yml`, se incluye la validación automatizada:
```yaml
      - name: Run Protected Games Guard Audit
        run: npm run audit:protected
```
Si cualquier Pull Request o Commit intenta alterar archivos exclusivos o dependencias de un juego `LOCKED` sin haber seguido el protocolo formal, **GitHub Actions bloqueará inmediatamente el build y el deploy**.

Adicionalmente, `.github/CODEOWNERS` exige revisión obligatoria de los mantenedores principales para cualquier archivo dentro de las rutas protegidas.
