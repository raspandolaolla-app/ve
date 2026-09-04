# 🤝 Guía de Contribución - RASPANDO LA OLLA 🇻🇪

¡Gracias por tu interés en contribuir a **Raspando La Olla (PulsoPLAY)**! 🎮  
Este documento te guiará a través del proceso para reportar errores, sugerir mejoras y enviar código, asegurando que mantengamos nuestros altos estándares de seguridad, rendimiento y experiencia de usuario.

---

## 📜 1. Código de Conducta

Al participar en este proyecto, te comprometes a:
- Ser respetuoso y constructivo en todas las interacciones (Issues, PRs, Discusiones).
- Priorizar la **seguridad del usuario** y la **integridad financiera** por encima de la velocidad de desarrollo.
- No introducir lógica de negocio crítica (saldos, turnos, sorteos) en el cliente sin su contraparte validada en el servidor (RPC `SECURITY DEFINER`).

---

## 🚀 2. Flujo de Trabajo para Contribuir

1. **Haz un Fork** del repositorio a tu cuenta de GitHub.
2. **Clona tu fork** localmente:  
   `git clone https://github.com/TU-USUARIO/ve.git`
3. **Crea una rama** con un nombre descriptivo siguiendo esta convención:
   - `feature/nombre-de-la-caracteristica` (ej: `feature/chat-en-sala`)
   - `fix/nombre-del-bug` (ej: `fix/duplicacion-cartones-bingo`)
   - `chore/nombre-de-la-tarea` (ej: `chore/actualizar-dependencias-vite`)
4. **Realiza tus cambios** y asegúrate de cumplir con los Estándares de Código (ver abajo).
5. **Haz Commit** de tus cambios usando mensajes claros (preferiblemente en español o inglés técnico):  
   `git commit -m "feat: agregar validación de turno en Atrapaíto"`
6. **Haz Push** a tu rama: `git push origin feature/nombre-de-la-caracteristica`
7. **Abre un Pull Request (PR)** hacia la rama `main` del repositorio original.

---

## 💻 3. Configuración del Entorno Local

Antes de escribir código, asegúrate de tener el entorno listo:

```bash
# 1. Instala las dependencias
npm install

# 2. Configura tus variables de entorno
cp .env.example .env.local
# Edita .env.local con tus credenciales de Supabase (URL y ANON_KEY)

# 3. Inicia el servidor de desarrollo
npm run dev
```

> **Nota:** Para probar cambios en la base de datos, debes tener acceso a un proyecto de Supabase (local o en la nube) y ejecutar las migraciones en la carpeta `supabase/migrations/`.

---

## 📏 4. Estándares de Código (Obligatorios)

### 🟦 Frontend (React / TypeScript)
- **TypeScript Estricto:** Está prohibido el uso de `any`. Utiliza las interfaces definidas en `src/types/`. El build debe pasar `tsc --noEmit` con **0 errores**.
- **Componentes:** Usa Functional Components y React Hooks. Evita la manipulación directa del DOM (excepto en motores de Canvas como `AtrapaítoGame.tsx`, donde debe estar debidamente documentado).
- **Estilos:** Usa exclusivamente **Tailwind CSS v4**. El diseño debe ser *Mobile-First* y respetar la paleta oscura "Premium Dark Casino" (fondo base `#0B0F17`).
- **Estado:** No mutar el estado directamente. Usa funciones inmutables o librerías de gestión de estado aprobadas. Deduplica arrays de jugadores/cartones para evitar renders infinitos.

### 🗄️ Base de Datos (Supabase / PostgreSQL)
- **Nomenclatura:** `snake_case` para tablas, columnas y funciones. `CamelCase` para variables en PL/pgSQL.
- **Nuevas Migraciones:** **NUNCA** modifiques una migración ya existente y fusionada. Crea un nuevo archivo con el siguiente número secuencial (ej: `125_nueva_funcionalidad.sql`).
- **Seguridad en RPCs:** Cualquier función que modifique saldos (`wallets`), estados de juego (`game_sessions`) o compre activos **DEBE** tener `SECURITY DEFINER` y `SET search_path = public, extensions`.
- **Concurrencia:** Las transacciones financieras o de estado crítico deben usar bloqueo pesimista: `SELECT ... FOR UPDATE`.
- **Recarga de Esquema:** Toda migración que altere funciones o tablas debe terminar con: `NOTIFY pgrst, 'reload schema';`.

---

## ✅ 5. Verificación Pre-Commit (Checklist)

Antes de hacer push, ejecuta estos comandos y asegúrate de que todos pasen:

- [ ] `npm run lint` (Sin errores ni advertencias críticas de ESLint).
- [ ] `npm run type-check` o `npx tsc --noEmit` (Sin errores de TypeScript).
- [ ] La funcionalidad fue probada manualmente en vista móvil y desktop.
- [ ] Si se modificó la base de datos, se incluyó el archivo `.sql` en la carpeta `supabase/migrations/`.
- [ ] No se incluyeron claves API, secretos o datos de usuarios reales en el código.

---

## 📝 6. Plantilla de Pull Request (PR)

Al abrir un PR, por favor completa la siguiente información para agilizar la revisión:

```markdown
## 📌 Descripción
Describe brevemente qué hace este PR y qué problema resuelve.

## 🔄 Tipo de Cambio
- [ ] 🐛 Bugfix (corrección de error)
- [ ] ✨ Feature (nueva funcionalidad)
- [ ] 🎨 UI/UX (mejora visual o de experiencia)
- [ ] 🗄️ Database (migración SQL o cambio de esquema)
- [ ] 🧹 Chore (refactorización, dependencias, configuración)

## 🧪 Pruebas Realizadas
- [ ] Probado en Chrome/Firefox/Safari (Desktop).
- [ ] Probado en vista móvil (iOS/Android).
- [ ] Verificado que no rompe la regla de negocio 90/10 o la integridad del ledger.

## 🗄️ Migraciones de Base de Datos
- [ ] Sí, se incluye nueva migración (Nombre: `___`)
- [ ] No, no se requieren cambios en la BD.

## 📸 Capturas de Pantalla (Si aplica)
[Añade imágenes o GIFs mostrando el cambio visual o funcional]
```

---

## 🛡️ 7. Reglas de Oro de Seguridad (NO IGNORAR)

1. **El cliente miente, el servidor no:** Toda validación de reglas de juego, turnos y saldos debe existir en una función RPC de PostgreSQL. El frontend solo proyecta el estado.
2. **Prohibido el dinero fantasma:** Ninguna función debe permitir sumar o restar saldo sin un registro correspondiente e inmediato en `ledger_entries`.
3. **Idempotencia:** Las operaciones críticas (comprar cartón, unirse a mesa) deben ser idempotentes o usar `idempotency_key` para evitar doble cobro por latencia de red.

---

## 📞 ¿Necesitas Ayuda?

Si tienes dudas sobre la arquitectura, cómo implementar una regla de juego o cómo estructurar una migración SQL:
1. Revisa la documentación técnica en la carpeta `/docs`.
2. Abre un **Issue** en GitHub con la etiqueta `question` o `architecture`.
3. Revisa el historial de migraciones (`supabase/migrations/`) para ver cómo se resolvieron problemas similares en el pasado.

---

<div align="center">
  <br>
  <sub>¡Gracias por ayudar a construir la mejor plataforma de juegos tradicionales de Venezuela! 🇻🇪🎮</sub>
</div>
