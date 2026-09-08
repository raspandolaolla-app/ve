# DIRECTIVAS DE GOBERNANZA Y PROMPT MAESTRO DE AUTOMATIZACIÓN
# RASPANDO LA OLLA 🇻🇪 / PULSOPLAY

REPOSITORIO CANÓNICO: https://github.com/raspandolaolla-app/ve
RAMA PRINCIPAL: main

## Directiva de Documentación Obligatoria
En cada turno donde se realicen modificaciones, correcciones, nuevas funcionalidades o mejoras a la WebApp, el archivo `WEBAPP_INFORME_GENERAL_COMPLETO.txt` debe ser actualizado con:
1. Fecha y hora de actualización más reciente.
2. Estado de compilación y verificación de linter (`PASS`).
3. Resumen de las últimas mejoras técnicas, backend, migraciones o mejoras de UI/UX integradas.
4. Lista actualizada de tablas, funcionalidades y estado general.

## Protocolo de Automatización Git
Al finalizar cualquier modificación:
1. `npm run typecheck` (PASS, exit code 0).
2. `npm run lint` (PASS, exit code 0).
3. `npm run build` (PASS, exit code 0).
4. `git diff --stat` para auditar que solo los archivos necesarios fueron afectados.
5. Commit semántico (`fix(...)`, `feat(...)`, `docs(...)`, etc.).
6. Push a `origin main`.
7. Verificar estado de ejecución de GitHub Actions hasta confirmación exitosa de deploy.
