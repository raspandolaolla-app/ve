# ⚖️ CHECKLIST DE CUMPLIMIENTO LEGAL & REGULATORIO — RASPANDO LA OLLA

**Versión:** 2.0 (Fase 2 - Matriz de Requisitos Legales y Regulatorios)  
**Estado:** 🔒 SAFE DEVELOPMENT MODE (Activación de Dinero Real Bloqueada)

---

## 1. Declaración de Principio Legal

> ⚠️ **AVISO LEGAL OBLIGATORIO:**  
> La plataforma **Raspando La Olla** opera en modo de desarrollo seguro (`SAFE_DEVELOPMENT_MODE = true`).  
> Ninguna funcionalidad de dinero real, recargas o retiros será habilitada sin la debida autorización jurídica, regulatoria y tributaria aplicable en la República Bolivariana de Venezuela.

---

## 2. Matriz de Requisitos de Cumplimiento (Compliance Roadmap)

| Área | Requisito Obligatorio | Estado Actual | Mitigación Técnica en Fase 2 |
| :--- | :--- | :---: | :--- |
| **Mayoría de Edad (+18)** | Prohibición absoluta de participación a menores de edad | 🔒 Activo | Restricción CHECK en PostgreSQL (`birth_date <= CURRENT_DATE - 18 years`). |
| **Términos y Condiciones** | Aceptación expresa de reglas de juego y comisión del 10% | 📝 En redacción | Formulario de consentimiento vinculado a `profiles.created_at`. |
| **Política de Privacidad** | Protección de datos personales (cédula, teléfono, bancarios) | 🔒 Activo | Hashing de cédula (`cedula_hash`), enmascaramiento visual y RLS estricto. |
| **Prevención de Fraude (KYC)**| Verificación de identidad con documento oficial | 🔒 Diseñado | Tabla `kyc_verifications` con almacenamiento en Supabase Storage privado. |
| **Control de Cuentas Múltiples**| Una sola cuenta por persona natural | 🔒 Activo | Restricción UNIQUE en `cedula_hash`. |
| **Auditoría Financiera** | Trazabilidad contable inmutable | 🔒 Diseñado | Ledger de doble entrada append-only con retención fiscal de 10 años. |
| **Seguridad Transaccional** | Autenticación de dos factores (2FA) para retiros | 🔒 Diseñado | Exigencia de nivel de aseguramiento Supabase TOTP AAL2. |
| **Marco Regulatorio y Fiscal**| Consultoría legal sobre juegos de habilidad y comisiones | ⏳ Pendiente | Modo seguro activo; balance de dinero real deshabilitado. |

---

## 3. Prerrequisitos Obligatorios para Habilitar Dinero Real

1. [ ] Dictamen jurídico emitido por asesor legal calificado en legislación venezolana.
2. [ ] Redacción y publicación de Términos de Servicio y Política de Privacidad definitivos.
3. [ ] Integración con canal bancario oficial para conciliación automatizada de Pago Móvil.
4. [ ] Auditoría de seguridad y penetración (Pentest) sobre las políticas RLS y funciones PostgreSQL.
5. [ ] Aprobación formal por parte del Oficial de Cumplimiento / Super Administrador.
