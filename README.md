# RASPANDO LA OLLA 🇻🇪

> Plataforma web de juegos tradicionales venezolanos con mesas multijugador en tiempo real, salas privadas ("Trancaíto"), billetera ledger de doble entrada y sistema de liquidación basado en la regla 90/10.

---

## 📌 Resumen del Proyecto

- **Frontend:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Motion, Lucide Icons.
- **Backend / Persistencia (Preparado):** Supabase (PostgreSQL 15+), Row Level Security (RLS), Procedimientos Almacenados `SECURITY DEFINER` con bloqueo pesimista `SELECT ... FOR UPDATE`.
- **Integridad Financiera:** Billetera con libro mayor inmutable (`ledger_entries`), doble entrada, saldos segregados (Disponible, Retenido, Total) y cálculo de premios 90% ganador / 10% plataforma.
- **Repositorio Oficial:** [https://github.com/raspandolaolla-app/ve](https://github.com/raspandolaolla-app/ve)

---

## 🎮 Catálogo de Juegos

1. **3 en Raya (La Vieja)** — Clásico juego de alineación rápida.
2. **Piedra, Papel o Tijera** — Duelo directo al mejor de 3 o 5 rondas.
3. **Damas Venezolanas** — Tablero tradicional de captura diagonal.
4. **Dominó Venezolano** — Modalidad por parejas o individual hasta 100 puntos.
5. **Truco Venezolano** — Baraja española con envite, truco, flor y ley.
6. **Bingo Online** — Extracción de balotas y cartones interactivos.
7. **Polla Venezolana** — Pronósticos deportivos y eventos por pozo común.
8. **Atrapaíto** — Juego de reflejos y rapidez mental.

---

## 🚀 Ejecución en Entorno Local

### Requisitos Previos
- Node.js 20+
- npm 10+ (o bun / pnpm)

### Pasos de Instalación
```bash
# 1. Clonar el repositorio
git clone https://github.com/raspandolaolla-app/ve.git
cd ve

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local

# 4. Iniciar servidor de desarrollo
npm run dev
```
