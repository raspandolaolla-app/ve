# FASE 22: TÉRMINOS, CONDICIONES, MAYORÍA DE EDAD (+18) Y PROTECCIÓN LEGAL
**Proyecto:** Raspando La Olla  
**Estado:** Implementado, Verificado y Documentado  
**Fecha:** 26 de Agosto de 2026  
**Versión de Términos:** 1.0  

---

## 1. Resumen Ejecutivo
La Fase 22 incorpora en **Raspando La Olla** el marco normativo y operativo de términos de uso, confirmación obligatoria de mayoría de edad (+18 años), política de privacidad, reglas de juego limpio y directrices de juego responsable.

Se garantiza una experiencia transparente para el usuario y una arquitectura de cumplimiento sin alterar los 8 motores de juego, sin romper la autenticación real con Google OAuth, y sin modificar las migraciones de base de datos existentes.

> **Nota de Responsabilidad Legal:** La presente implementación y los textos incorporados constituyen una estructura operativa y técnica de transparencia y buenas prácticas de producto digital. No constituyen asesoramiento jurídico formal ni sustituyen la revisión por parte de profesionales del derecho en las jurisdicciones pertinentes.

---

## 2. Naturaleza y Carácter de la Plataforma
- **Plataforma Digital de Entretenimiento:** Se define a RASPANDO LA OLLA como una plataforma digital de juegos interactivos, recreativos y de destreza tradicional en tiempo real (Truco, Dominó, Bolas Criollas, Ludo, etc.).
- **No es Casino ni Entidad Financiera:** La plataforma no se presenta ni opera como casino, casa de apuestas, operador de juegos de azar ni institución bancaria.
- **Sin Promesas de Ganancia:** Se establece con claridad que las dinámicas son lúdicas y no existe promesa, garantía ni derecho automático a rentabilidades económicas.
- **Redacción Prudente de Responsabilidad:** Se delimita que el usuario opera bajo su propia responsabilidad y que las limitaciones aplicables rigen estrictamente en la medida permitida por la legislación correspondiente (sin cláusulas absolutas ni deslindes abusivos).

---

## 3. Requisito de Mayoría de Edad (+18 Años)
- **Confirmación Obligatoria:** Casilla interactiva `[ ] Declaro que soy mayor de 18 años y cuento con capacidad legal para participar.`
- **Bloqueo de Interfaz:** No es posible enviar el formulario ni habilitar la cuenta si la casilla no está marcada.
- **Sin Pre-marcado Automático:** La casilla inicia desmarcada de forma obligatoria.
- **Coherencia con Perfil:** La fecha de nacimiento en el perfil de usuario mantiene la validación de mayoría de edad.

---

## 4. Aceptación Obligatoria de Términos (v1.0)
- **Casilla de Aceptación:** `[ ] He leído y acepto los Términos y Condiciones de Uso.`
- **Acceso Directo al Contenido:** Enlaces directos y modales con el texto íntegro de:
  1. *Términos y Condiciones Generales de Uso (v1.0)*
  2. *Política de Privacidad y Tratamiento de Datos*
  3. *Reglas de Uso de la Plataforma y Juego Limpio*
  4. *Política de Juego Responsable y Mayoría de Edad (+18)*
- **Flujo Google OAuth:**
  ```
  Inicio con Google OAuth
          ↓
  Sesión autenticada en Supabase
          ↓
  ¿Aceptó Términos v1.0 y +18?
     ├── SÍ → Acceso normal a Lobby/Mesas/Billetera
     └── NO → Modal Bloqueante de Aceptación Legal
                 ├── [x] Mayor de 18 años
                 ├── [x] Acepto Términos v1.0
                 └── Confirmar → Registro de Aceptación → Cuenta Habilitada
  ```

---

## 5. Registro y Auditoría de la Aceptación
Para respetar la directriz de **no modificar migraciones existentes**, se implementó un mecanismo dual de registro:
1. **Metadatos Protegidos de Supabase Auth:** Mediante `supabase.auth.updateUser({ data: { terms_accepted_version: '1.0', terms_accepted_at: ISO_STRING, is_adult_confirmed: true } })`.
2. **Almacenamiento Local Verificado:** Registro estructurado por ID de usuario (`rlo_terms_acceptance_${userId}`) con marca de tiempo, origen de plataforma y versión.

### Propuesta de Esquema SQL para Futuras Migraciones (Opcional):
Si en fases posteriores se desea persistir una tabla relacional dedicada con Row Level Security, se propone la siguiente estructura:
```sql
CREATE TABLE IF NOT EXISTS public.user_terms_acceptance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version VARCHAR(20) NOT NULL,
  is_adult_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET NULL,
  user_agent TEXT NULL,
  CONSTRAINT uq_user_terms_version UNIQUE (user_id, terms_version)
);

ALTER TABLE public.user_terms_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_terms_acceptance FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own terms acceptance"
  ON public.user_terms_acceptance FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own terms acceptance"
  ON public.user_terms_acceptance FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

---

## 6. Archivos Creados y Modificados

### Archivos Creados:
- `/src/types/legal.ts`: Definición de tipos de documentos legales, versiones (`TermsVersion = '1.0'`) y registros de auditoría.
- `/src/data/legalDocuments.ts`: Redacción integral de los 4 documentos legales en español (Términos, Privacidad, Reglas y Juego Responsable).
- `/src/services/legal/TermsService.ts`: Servicio para verificar y registrar la aceptación de términos tanto en Supabase Auth como localmente.
- `/src/components/legal/LegalModal.tsx`: Visor interactivo y accesible de documentos legales por pestañas.
- `/src/components/legal/TermsAcceptanceModal.tsx`: Modal obligatorio de confirmación de edad y aceptación de términos.
- `/docs/PHASE_22_TERMS_AGE_AND_LEGAL_PROTECTION.md`: Este informe de fase.

### Archivos Modificados:
- `/src/types/index.ts`: Exportación de tipos legales.
- `/src/features/auth/AuthContext.tsx`: Detección de estado `hasAcceptedTerms`, `termsRecord` y método `confirmTermsAccepted()`.
- `/src/App.tsx`: Integración del visor legal `LegalModal` y el guardián de aceptación `TermsAcceptanceModal`.
- `/src/components/layout/Footer.tsx`: Enlaces directos en el pie de página a los 4 documentos legales.
- `/src/features/profile/ProfileView.tsx`: Tarjeta de estado de cumplimiento legal y botón de consulta de términos.

---

## 7. Pruebas Realizadas y Resultados

| Caso de Prueba | Resultado |
|---|---|
| 1. Usuario no autenticado consulta términos desde el Footer | **Aprobado** (Abre visor con las 4 secciones) |
| 2. Usuario nuevo inicia sesión con Google | **Aprobado** (Se despliega modal de confirmación obligatorio) |
| 3. Intento de continuar sin marcar casilla +18 | **Aprobado** (Botón bloqueado y deshabilitado) |
| 4. Intento de continuar sin marcar casilla de Términos | **Aprobado** (Botón bloqueado y deshabilitado) |
| 5. Confirmación con ambas casillas marcadas | **Aprobado** (Se guarda el registro, cierra el modal y habilita la app) |
| 6. Usuario con términos aceptados recarga la página | **Aprobado** (Acceso fluido sin volver a mostrar el modal) |
| 7. Consulta de estado de términos desde Perfil | **Aprobado** (Muestra "Versión 1.0 Aceptada" y fecha) |
| 8. Opción "Cerrar sesión / Cancelar" en modal de términos | **Aprobado** (Cierra la sesión y regresa al estado no autenticado) |
| 9. Validación TypeScript (`npm run typecheck` / `tsc --noEmit`) | **Aprobado** (0 errores de compilación) |
| 10. Compilación para producción (`npm run build`) | **Aprobado** (Generación limpia de bundle en `dist/`) |
