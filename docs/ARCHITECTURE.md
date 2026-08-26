# 🏛️ ARQUITECTURA GENERAL — RASPANDO LA OLLA

## 1. Visión General
**Raspando La Olla** es una plataforma multijugador online en tiempo real para juegos tradicionales venezolanos (Dominó, Truco, Bingo, 3 en Raya, Damas, etc.), con liquidación contable bajo la **Regla 90/10** (90% al ganador / 10% comisión de servicio de plataforma).

---

## 2. Pila Tecnológica (Tech Stack)

### Frontend (Cliente Público)
- **Framework:** React 19 + TypeScript (Modo Strict)
- **Empaquetador:** Vite 6
- **Estilos:** Tailwind CSS v4
- **Iconos:** Lucide React
- **Despliegue:** GitHub Pages / Cloud Run
- **Cliente Backend:** `@supabase/supabase-js` (Únicamente anon key pública)

### Backend & Persistencia (Fuente de Verdad)
- **Autenticación:** Supabase Auth (Google OAuth Real + PKCE Flow)
- **Base de Datos:** PostgreSQL en Supabase
- **Seguridad:** Row Level Security (RLS) en el 100% de las tablas
- **Mecanismos Transaccionales:** Funciones PostgreSQL (`SECURITY DEFINER`) con transacciones ACID para cobro de entradas, reservas y liquidaciones (Settlement).
- **Operaciones Privilegiadas:** Supabase Edge Functions (Deno/TypeScript)
- **Sincronización en Vivo:** Supabase Realtime (Presence & Broadcast)

---

## 3. Principio de Flujo de Datos

```
[Componente UI] 
      ↓
[Hook / ViewModel]
      ↓
[Service / Repository] (src/services/repositories/)
      ↓
[Supabase Client (Anon Key)]
      ↓
[PostgreSQL + RLS / Edge Functions] ← (Fuente de Verdad)
```

1. **El navegador no es autoridad:** Ningún valor crítico (saldos, premios, comisiones, ganadores, turnos) es calculado o aceptado ciegamente desde el cliente.
2. **Idempotencia:** Todas las operaciones transaccionales requieren `idempotency_key` para evitar duplicaciones por reintentos de red.
3. **Ledger Inmutable:** El saldo no es una simple columna editable; se respalda mediante asientos contables de débito y crédito.
