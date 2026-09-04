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
