// ==============================================================================
// RASPANDO LA OLLA — TEXTOS LEGALES, TÉRMINOS Y CONDICIONES (VERSIÓN 1.0)
// ==============================================================================
// Redacción prudente, transparente y apegada a la naturaleza de la plataforma:
// Plataforma digital de juegos tradicionales interactivos y entretenimiento.
// ==============================================================================

import type { LegalDocument, TermsVersion } from '../types/legal';

export const CURRENT_TERMS_VERSION: TermsVersion = '1.0';
export const TERMS_LAST_UPDATED = '26 de Agosto de 2026';

export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {
  terms: {
    id: 'terms',
    title: 'Términos y Condiciones Generales de Uso',
    shortTitle: 'Términos y Condiciones',
    version: CURRENT_TERMS_VERSION,
    lastUpdated: TERMS_LAST_UPDATED,
    summary:
      'Regula el acceso y uso de la plataforma digital Raspando La Olla, los derechos y deberes del usuario, el carácter de entretenimiento de los juegos y la operación transparente del sistema.',
    sections: [
      {
        title: '1. Naturaleza del Servicio y Objeto de la Plataforma',
        paragraphs: [
          'RASPANDO LA OLLA es una plataforma digital de juegos interactivos, recreativos y de entretenimiento orientada a la preservación y disfrute de juegos de mesa y destreza tradicionales en modalidad multijugador en tiempo real.',
          'La plataforma NO constituye un casino, casa de apuestas, operador de juegos de azar, institución financiera, casa de cambio ni entidad bancaria. Todas las dinámicas ofrecidas corresponden a experiencias recreativas interactivas entre usuarios participantes bajo reglas de juego público y transparente.',
        ],
      },
      {
        title: '2. Requisito Indispensable de Mayoría de Edad (+18 Años)',
        paragraphs: [
          'El acceso, registro y uso de RASPANDO LA OLLA está reservado exclusivamente para personas naturales que hayan cumplido dieciocho (18) años de edad y que cuenten con plena capacidad civil y legal para contratar y obligarse conforme a la legislación aplicable.',
          'Queda estrictamente prohibido el acceso, creación de cuentas o participación de menores de edad en cualquier sección de la plataforma. La plataforma se reserva el derecho de requerir verificación de edad o documentación probatoria en cualquier momento.',
        ],
      },
      {
        title: '3. Aceptación Expresa y Registro de Conformidad',
        paragraphs: [
          'Al completar el registro, iniciar sesión mediante proveedores de identidad (como Google OAuth) o utilizar las funcionalidades de la plataforma, el usuario declara haber leído, comprendido y aceptado en su totalidad los presentes Términos y Condiciones, así como la Política de Privacidad y las Reglas de Uso.',
          'La aceptación queda formalmente registrada en el sistema con constancia de identidad de cuenta, versión de los términos y fecha/hora exacta de suscripción.',
        ],
      },
      {
        title: '4. Responsabilidad y Obligaciones del Usuario',
        paragraphs: [
          'El usuario asume plena responsabilidad por el uso que haga de su cuenta y de la plataforma, comprometiéndose a:',
        ],
        bulletPoints: [
          'Suministrar información verídica, exacta y actualizada durante su registro y configuración de perfil.',
          'Mantener la estricta confidencialidad y custodia de sus credenciales de acceso y dispositivos personales.',
          'No compartir, transferir ni ceder el acceso de su cuenta a terceros bajo ningún concepto.',
          'Utilizar la plataforma en estricto cumplimiento de las leyes y normas vigentes.',
          'Respetar las reglas de cada modalidad de juego y mantener un trato respetuoso hacia los demás participantes.',
          'No intentar vulnerar, alterar, manipular o burlar los mecanismos de seguridad, partidas, contabilidad o validaciones del sistema.',
        ],
      },
      {
        title: '5. Carácter de Entretenimiento y Ausencia de Promesas de Ganancia',
        paragraphs: [
          'Los juegos y salas disponibles en RASPANDO LA OLLA se ofrecen única y exclusivamente como experiencias interactivas de recreación y entretenimiento.',
          'La plataforma no promete, asegura ni garantiza rentabilidades, ganancias fijas, rendimientos económicos ni resultados específicos. La participación en partidas involucra decisiones lúdicas y habilidad de los participantes, sin que exista derecho automático a obtener beneficios económicos.',
        ],
      },
      {
        title: '6. Gestión de Saldos, Billetera y Reglas Operativas',
        paragraphs: [
          'Para la participación en mesas de juego que utilicen saldo en Bolívares (Bs.), la plataforma opera bajo las siguientes directrices:',
        ],
        bulletPoints: [
          'Las recargas de saldo están sujetas a validación administrativa y verificación de los comprobantes bancarios emitidos (Pago Móvil / Transferencias).',
          'Las solicitudes de retiro de fondos están sujetas a revisión de cumplimiento, titularidad de cuenta bancaria y controles de seguridad antifraude.',
          'La plataforma aplica una regla de distribución transparente y fija en mesas con pozo (por ejemplo, regla 90% para ganadores y 10% de tarifa por servicio y mantenimiento de plataforma).',
          'En caso de empate reglamentario o anulación justificada de una mesa, el sistema reembolsa íntegramente las aportaciones a los jugadores participantes.',
          'La plataforma podrá establecer límites mínimos y máximos de operación para resguardar la seguridad del sistema y prevenir actividades irregulares.',
        ],
      },
      {
        title: '7. Usos y Conductas Estrictamente Prohibidas',
        paragraphs: [
          'Constituyen conductas prohibidas y causales de suspensión inmediata o terminación de la cuenta, sin perjuicio de las acciones legales que correspondan:',
        ],
        bulletPoints: [
          'Fraude, suplantación de identidad o uso de cuentas bancarias de terceros sin autorización.',
          'Creación de múltiples cuentas por una misma persona con el fin de evadir sanciones, límites o controles.',
          'Uso de bots, emuladores automatizados, scripts no autorizados o software de asistencia para obtener ventajas desleales.',
          'Manipulación de paquetes de red, inyección de código, explotación de errores o vulnerabilidades técnicas.',
          'Ataques de denegación de servicio (DoS/DDoS) o intentos de sobrecargar la infraestructura del servidor.',
          'Colusión entre jugadores para perjudicar a terceros en partidas multijugador.',
          'Intento de ingeniería inversa maliciosa sobre los motores de juego o sistemas de la plataforma.',
        ],
      },
      {
        title: '8. Seguridad de la Cuenta',
        paragraphs: [
          'El usuario es el único custodio de su cuenta y debe notificar de inmediato cualquier actividad sospechosa o acceso no autorizado.',
          'La plataforma implementa controles perimetrales y de base de datos para la salvaguarda de la integridad de las cuentas.',
        ],
      },
      {
        title: '9. Limitación Prudente de Responsabilidad',
        paragraphs: [
          'El usuario comprende y acepta que el uso de la plataforma se realiza bajo su propia responsabilidad. RASPANDO LA OLLA realiza sus mejores esfuerzos técnicos para garantizar la estabilidad y disponibilidad de los servicios; no obstante, en la medida permitida por la legislación aplicable, no garantiza la total ausencia de interrupciones imprevistas debidas a fallas de proveedores de telecomunicaciones, caídas de internet del usuario, servicios de nube externos o eventos de fuerza mayor.',
          'Cualquier limitación de responsabilidad contenida en estos términos se aplicará estrictamente en la medida y alcance permitidos por las leyes vigentes.',
        ],
      },
      {
        title: '10. Servicios Técnicos de Terceros',
        paragraphs: [
          'La plataforma utiliza servicios tecnológicos de terceros para su correcto funcionamiento, tales como proveedores de autenticación segura (Google OAuth), infraestructura de base de datos en la nube y redes de distribución de contenido.',
          'Estos servicios operan bajo sus propios estándares de seguridad y disponibilidad.',
        ],
      },
      {
        title: '11. Modificaciones, Actualizaciones y Versiones de los Términos',
        paragraphs: [
          'RASPANDO LA OLLA podrá actualizar o modificar periódicamente estos Términos y Condiciones para reflejar cambios legales, mejoras en las funciones de la plataforma o ajustes operativos.',
          'Toda actualización sustancial será notificada a través de la aplicación mediante una nueva versión (ej. v1.1, v2.0), requiriendo que el usuario revise y confirme nuevamente su aceptación para continuar utilizando el servicio.',
        ],
      },
    ],
  },

  privacy: {
    id: 'privacy',
    title: 'Política de Privacidad y Tratamiento de Datos',
    shortTitle: 'Privacidad',
    version: CURRENT_TERMS_VERSION,
    lastUpdated: TERMS_LAST_UPDATED,
    summary:
      'Explica cómo recopilamos, utilizamos y protegemos la información personal y técnica necesaria para operar tu cuenta y partidas de forma segura.',
    sections: [
      {
        title: '1. Información Recopilada',
        paragraphs: [
          'Para ofrecer un entorno seguro y transparente, RASPANDO LA OLLA recopila únicamente la información indispensable para la prestación de los servicios:',
        ],
        bulletPoints: [
          'Datos de identificación y contacto: Nombre, correo electrónico y foto de perfil provistos durante la autenticación con Google.',
          'Datos de verificación y perfil: Estado de residencia en Venezuela, fecha de nacimiento para verificación de mayoría de edad y número de teléfono de contacto.',
          'Datos transaccionales: Historial de operaciones de recarga, retiro, participación en partidas y movimientos de billetera.',
          'Registros técnicos de seguridad: Marcas de tiempo de inicio de sesión, direcciones IP y eventos de auditoría para prevención de fraude y seguridad de cuentas.',
        ],
      },
      {
        title: '2. Finalidad del Tratamiento de Datos',
        paragraphs: [
          'La información recopilada se utiliza exclusivamente para los siguientes fines legítimos:',
        ],
        bulletPoints: [
          'Creación, mantenimiento y autenticación segura de cuentas de usuario.',
          'Operación de partidas multijugador en tiempo real y asignación correcta de resultados.',
          'Procesamiento y auditoría de solicitudes de recarga y retiro de saldo.',
          'Cumplimiento de políticas de prevención de fraude, colusión y accesos no autorizados.',
          'Atención de solicitudes de soporte técnico y resolución de incidencias.',
        ],
      },
      {
        title: '3. Protección y Confidencialidad',
        paragraphs: [
          'RASPANDO LA OLLA aplica rigurosos estándares de seguridad técnica, incluyendo conexiones cifradas SSL/TLS, políticas estrictas de control de acceso a datos y segregación de información.',
          'NO vendemos, alquilamos ni comercializamos los datos personales de nuestros usuarios con terceros.',
        ],
      },
      {
        title: '4. Derechos del Usuario',
        paragraphs: [
          'El usuario tiene derecho a consultar, actualizar o corregir sus datos de perfil en cualquier momento desde la sección de configuración de su cuenta en la plataforma.',
        ],
      },
    ],
  },

  rules: {
    id: 'rules',
    title: 'Reglas de Uso de la Plataforma y Juego Limpio',
    shortTitle: 'Reglas de Uso',
    version: CURRENT_TERMS_VERSION,
    lastUpdated: TERMS_LAST_UPDATED,
    summary:
      'Estándares de conducta, convivencia y juego limpio que rigen en todas las salas y partidas de Raspando La Olla.',
    sections: [
      {
        title: '1. Principio de Juego Limpio (Fair Play)',
        paragraphs: [
          'Todas las partidas en RASPANDO LA OLLA deben disputarse bajo un estricto espíritu deportivo de honestidad e igualdad de condiciones. Está terminantemente prohibido cualquier mecanismo que altere el desarrollo natural del juego.',
        ],
      },
      {
        title: '2. Prohibición de Asistencia Automatizada y Trampas',
        paragraphs: [
          'No se permite el uso de calculadoras externas automatizadas de probabilidades durante partidas activas, programas bot, sincronización maliciosa entre usuarios para compartir información de manos o cartas, ni explotación de errores de software.',
          'Las infracciones comprobadas acarrearán la anulación de la partida y la suspensión definitiva de los infractores.',
        ],
      },
      {
        title: '3. Respeto y Convivencia',
        paragraphs: [
          'Se exige mantener un trato respetuoso hacia los demás jugadores y el equipo de soporte. Quedan prohibidos los mensajes ofensivos, lenguaje de odio o conductas hostiles.',
        ],
      },
      {
        title: '4. Abandono Injustificado y Desconexiones',
        paragraphs: [
          'El abandono intencional de una partida activa con saldo en juego se considerará rendición y el sistema aplicará las reglas automáticas de turno o victoria por abandono para no perjudicar a los demás participantes.',
        ],
      },
    ],
  },

  responsible_gaming: {
    id: 'responsible_gaming',
    title: 'Política de Juego Responsable y Mayoría de Edad (+18)',
    shortTitle: 'Juego Responsable',
    version: CURRENT_TERMS_VERSION,
    lastUpdated: TERMS_LAST_UPDATED,
    summary:
      'Compromiso con el entretenimiento sano, la moderación, la protección de menores y las prácticas saludables de recreación digital.',
    sections: [
      {
        title: '1. Entretenimiento y Recreación Equilibrada',
        paragraphs: [
          'Los juegos tradicionales son expresiones culturales y recreativas destinadas al disfrute y la sana competencia. La participación debe mantenerse siempre dentro de límites saludables de tiempo y presupuesto personal.',
        ],
      },
      {
        title: '2. Recomendaciones de Juego Responsable',
        paragraphs: [
          'Para mantener una experiencia placentera, recomendamos a nuestros usuarios:',
        ],
        bulletPoints: [
          'Jugar exclusivamente por entretenimiento y diversión.',
          'Establecer límites personales de tiempo y saldo antes de comenzar.',
          'No participar bajo estados de alteración emocional, cansancio o estrés.',
          'Nunca destinar a la recreación fondos requeridos para gastos esenciales del hogar, salud o compromisos cotidianos.',
        ],
      },
      {
        title: '3. Tolerancia Cero con Menores de Edad',
        paragraphs: [
          'Reiteramos que el acceso a la plataforma está estrictamente prohibido a menores de 18 años. Recomendamos a los representantes y adultos no permitir que menores utilicen sus cuentas ni sus dispositivos con sesiones activas.',
        ],
      },
      {
        title: '4. Opción de Autoexclusión y Pausa de Cuenta',
        paragraphs: [
          'Cualquier usuario que sienta que el juego está dejando de ser una actividad recreativa puede solicitar el cierre temporal o permanente de su cuenta a través de los canales de atención al usuario.',
        ],
      },
    ],
  },
};
