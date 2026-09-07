## 📌 Descripción
<!-- Describe de forma concisa qué problema resuelve este Pull Request y qué funcionalidades o correcciones introduce -->

## 🔄 Tipo de Cambio
- [ ] 🐛 Bugfix (corrección de error)
- [ ] ✨ Feature (nueva funcionalidad)
- [ ] 🎨 UI/UX (mejora visual o de experiencia de usuario)
- [ ] 🗄️ Database (migración SQL o cambio de esquema en Supabase)
- [ ] 🛡️ Security (parche de seguridad o endurecimiento criptográfico)
- [ ] 🧹 Chore (mantenimiento, refactorización o actualización de dependencias)

## 🧪 Pruebas Realizadas
- [ ] Compilación limpia con `npm run lint` y `npx tsc --noEmit` (0 errores de TypeScript).
- [ ] Verificado en navegadores de escritorio (Chrome / Safari / Firefox).
- [ ] Verificado en dispositivos móviles (responsividad y soporte táctil).
- [ ] Verificado que no altera la regla 90/10 ni la inmutabilidad de `ledger_entries`.
- [ ] Probado en salas en tiempo real (WebSockets de Supabase).

## 🗄️ Migraciones de Base de Datos
- [ ] Sí, se incluye nueva migración secuencial en `supabase/migrations/` (Nombre: `___`).
- [ ] No requiere cambios en la base de datos.

## 📸 Capturas de Pantalla / Evidencia Visual
<!-- Si aplica, incluye capturas o GIFs demostrando el cambio -->

## 📋 Checklist de Calidad
- [ ] He leído y respetado la [Guía de Contribución](../CONTRIBUTING.md).
- [ ] No se han expuesto claves privadas, secretos o variables sensibles en el código.
- [ ] Toda mutación financiera o de estado de juego se procesa en el servidor con RPCs `SECURITY DEFINER`.
