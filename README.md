# 🇻🇪 RASPANDO LA OLLA | PulsoPLAY

> **La plataforma multijugador definitiva de juegos tradicionales venezolanos.**  
> Mesas en tiempo real, salas privadas ("Trancaíto"), billetera con ledger inmutable y un sistema de premios justo y transparente (Regla 90/10).

<div align="center">

[![Estado](https://img.shields.io/badge/Estado-En%20Prueba%20Beta-amber?style=for-the-badge)](https://raspandolaolla-app.github.io/ve/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)

🔗 **[🎮 JUGAR AHORA (Modo Prueba)](https://raspandolaolla-app.github.io/ve/)** | 📂 [Repositorio Oficial](https://github.com/raspandolaolla-app/ve)

</div>

---

## 🎁 ¡MODO PRUEBA ACTIVO! (5.000 Bs Gratis)

🚀 **Estamos en fase de pruebas y queremos que seas parte.**  
Al crear tu cuenta, recibirás automáticamente un **Bono de Prueba de 5.000 Bs** (ficticios).  
✅ Úsalo para jugar, probar las mecánicas, crear mesas y validar el sistema **sin ningún riesgo financiero**.  
*(Nota: Los administradores pueden realizar limpiezas de datos de prueba periódicas para mantener la base de datos optimizada).*

---

## 🎮 Catálogo de Juegos

Disfruta de una experiencia fluida a 60 FPS con sincronización en tiempo real y motores de reglas *server-authoritative* (a prueba de trampas).

| Juego | Descripción | Modalidad |
| :--- | :--- | :---: |
| ♟️ **Ajedrez Criollo** | Reglas FIDE oficiales, reloj por turno y detección de jaque mate. | 1v1 |
| 🁐 **Dominó Venezolano** | 28 fichas, tranca de mesa, recuento de puntos y bot anti-inactividad. | 2v2 / 1v1 |
| 🃏 **Truco Venezolano** | Baraja española, cantos de Envido, Flor, Truco y Vale Cuatro. | 2v2 |
| 🎱 **Bingo Online** | Salas de 75 y 90 bolas, cuenta regresiva de 3 min y bloqueo de ventas justo. | Multijugador |
| 🐎 **Polla Venezolana** | Quiniela de 77 animalitos con sorteos por bloques y comprobantes PNG. | Global |
| 🔴 **Atrapaíto Criollo** | Duelo táctico 9x15 de canicas y muros con ley de camino libre y saltos. | 1v1 / vs IA |
| ⚫ **Damas Venezolanas** | Capturas diagonales obligatorias, saltos en cadena y coronación. | 1v1 |
| ✊ **Piedra, Papel o Tijera** | Duelo rápido con sistema *commit-reveal* criptográfico. | 1v1 |
| ⭕ **La Vieja (3 en Raya)** | Clásico juego de alineación rápida con modo torneo. | 1v1 |
| 🟥 **UNA-OLLA** | Cartas de acción, penalizaciones por no cantar y escalera de vidas. | Multijugador |

---

## 📸 Galería de la Plataforma

*(Reemplaza estas URLs con capturas de pantalla reales de tu proyecto)*

<div align="center">
  <img src="https://via.placeholder.com/800x400/131926/FFFFFF?text=Captura+del+Lobby+Principal+y+Selección+de+Juegos" alt="Lobby Principal" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); margin-bottom: 20px;">
  <br>
  <img src="https://via.placeholder.com/400x300/1A2235/FFFFFF?text=Tablero+de+Bingo+en+Vivo" alt="Bingo en Vivo" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); margin: 10px;">
  <img src="https://via.placeholder.com/400x300/1A2235/FFFFFF?text=Partida+de+Atrapaíto+Criollo+1v1" alt="Atrapaíto 1v1" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); margin: 10px;">
</div>

---

## ✨ Características Técnicas y de Justicia

- ⚡ **Tiempo Real Garantizado**: Sincronización de estados mediante WebSockets (Supabase Realtime) con reconexión automática y manejo de latencia.
- 🛡️ **Seguridad Blindada**: Autenticación de Dos Factores (2FA TOTP), saneamiento de entradas XSS y roles estrictos (RBAC).
- ⚖️ **Regla 90/10 Transparente**: El 90% del pozo va directamente al ganador y el 10% a la plataforma. Todo registrado en un *ledger* inmutable de doble entrada.
- 🚫 **Anti-Abandono y Anti-Trampas**: Si un jugador se desconexiona o agota su tiempo, el sistema liquida la partida automáticamente a favor del rival. Validación de asientos únicos por `user_id`.
- 📱 **Diseño Mobile-First**: Interfaz inmersiva, modo pantalla completa y bloqueo inteligente del teclado virtual en dispositivos móviles.

---

## ❓ Preguntas Frecuentes (FAQ)

<details>
<summary><b>💰 ¿Estoy jugando con dinero real?</b></summary>
Actualmente, la plataforma está en <b>Modo Prueba</b>. El saldo de 5.000 Bs que recibes es ficticio y sirve exclusivamente para validar la funcionalidad de la webapp. No se requieren depósitos reales en esta fase.
</details>

<details>
<summary><b>🔌 ¿Qué pasa si se me va el internet a mitad de partida?</b></summary>
¡No te preocupes! El sistema guarda el estado de la partida en el servidor. Tienes un tiempo límite para reconectarte. Si el tiempo de tu turno expira, el sistema aplicará la regla de abandono y tu rival ganará la partida automáticamente.
</details>

<details>
<summary><b>🎱 ¿Cómo sé que el sorteo de Bingo o la Polla no están manipulados?</b></summary>
Utilizamos un motor de sorteo <i>server-authoritative</i>. En el caso de la Polla, los resultados se basan en sorteos oficiales, y en el Bingo, la secuencia de balotas se sella criptográficamente antes de iniciar la cuenta regresiva.
</details>

<details>
<summary><b>🛠️ ¿Cómo puedo reportar un error o sugerir una mejora?</b></summary>
Puedes abrir un <a href="https://github.com/raspandolaolla-app/ve/issues">Issue en nuestro repositorio</a> o contactar al soporte directamente desde la pestaña "Perfil" en la aplicación.
</details>

---

## 🛠️ Stack Tecnológico (Para Desarrolladores)

- **Frontend**: React 19, Vite 6, TypeScript ~5.8, Tailwind CSS v4, Motion (animaciones), Lucide React (iconos).
- **Backend & Base de Datos**: Supabase (PostgreSQL 15+), Row Level Security (RLS), Funciones RPC `SECURITY DEFINER` con bloqueo pesimista (`FOR UPDATE`).
- **Despliegue**: Netlify / GitHub Pages (PWA con Service Worker y manifiesto offline).

### 🚀 Inicio Rápido (Local)
```bash
# 1. Clonar el repositorio
git clone https://github.com/raspandolaolla-app/ve.git
cd ve

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# (Edita .env.local con tus credenciales de Supabase)

# 4. Iniciar servidor de desarrollo
npm run dev
