# 🚀 DESPLIEGUE EN GITHUB PAGES — RASPANDO LA OLLA

## 1. Configuración de Base Path
Vite soporta despliegues en subdirectorios mediante `base` configurable en `vite.config.ts`:

```typescript
const basePath = process.env.VITE_APP_BASE_PATH || '/';
```

## 2. Redirección y Enrutamiento SPA
- GitHub Pages no soporta de forma nativa la reescritura de URLs para Single Page Applications.
- Se incluye `/public/404.html` que captura rutas directas y redirige limpiamente al punto de entrada `./` conservando la ruta solicitada mediante `sessionStorage`.

## 3. Flujo Automático de GitHub Actions
El archivo `.github/workflows/deploy.yml` ejecuta en cada `push` a las ramas `main` o `master`:
1. `npm ci` o `npm install`
2. `npm run typecheck` (verificación estricta de tipos con TypeScript)
3. `npm run build` (compilación de producción con Vite)
4. Publicación automática a la rama de GitHub Pages (`actions/deploy-pages@v4`).
