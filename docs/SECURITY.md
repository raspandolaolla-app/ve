# 🔒 POLÍTICA DE SEGURIDAD — RASPANDO LA OLLA

## 1. Regla Absoluta de Secretos
- **`SUPABASE_SERVICE_ROLE_KEY` NUNCA se incluye en el frontend.**
- El código en `src/` únicamente tiene acceso a `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- Las variables de entorno con privilegios administrativos residen exclusivamente en las Edge Functions de Supabase.

## 2. Row Level Security (RLS)
- Todas las tablas de la base de datos deben tener RLS activado (`ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`).
- Ninguna tabla contiene políticas permisivas arbitrarias como `USING (true)`.
- El rol `PLAYER` únicamente puede consultar su propia información y datos públicos indispensables de los participantes de una mesa.

## 3. Privacidad y Datos Personales (Cédula y Teléfono)
- La cédula de identidad venezolana nunca se expone completa en respuestas públicas de la API.
- Se almacena un hash seguro para unicidad y una versión truncada (`V-***456`) para la interfaz del usuario.

## 4. Control de Mayoría de Edad (18+)
- La validación de edad se calcula en el servidor PostgreSQL al verificar la fecha de nacimiento contra la fecha actual (`CURRENT_DATE`).
- No se permite el acceso a mesas de juego ni transacciones a usuarios menores de 18 años o con verificación pendiente.

## 5. Autenticación de Dos Factores (MFA / 2FA)
- Se utiliza Supabase TOTP MFA.
- Operaciones sensibles (solicitud de retiro, actualización de datos de Pago Móvil, acciones administrativas) exigen nivel de aseguramiento de autenticación `AAL2`.

## 6. Anti-Cheat & Motor de Juego Server-Authoritative
- El cliente solo envía **intenciones o acciones** (ej: `MOVE_PIECE`, `PLAY_CARD`, `SUBMIT_CHOICE`).
- El servidor valida turnos, reglas y calcula el nuevo estado.
- Para juegos simultáneos (como Piedra, Papel o Tijera) se implementa un esquema **Commit-Reveal** criptográfico.
