// src/data/gameInfo.ts

export interface GameInfo {
  id: string;
  aliases?: string[];
  title: string;
  description: string;
  icon: string;
  isHot: boolean;
  category: 'estrategia' | 'azar' | 'cartas' | 'tablero' | 'sorteo';
  players: string;
  duration: string;
  difficulty: 'Fácil' | 'Medio' | 'Difícil';
  rules: string[];
  objective: string;
  tips: string[];
}

export const GAMES_INFO: GameInfo[] = [
  {
    id: 'bingo',
    aliases: ['bingo_online', 'bingo_75', 'bingo_90'],
    title: 'Bingo Online (75 y 90 Bolas)',
    description: 'Sorteos en vivo cada 2 segundos. Salas gemelas 75 y 90 bolas con pozo neto del 90%.',
    icon: '🎱',
    isHot: true,
    category: 'sorteo',
    players: '2 a 99 jugadores',
    duration: '3 a 10 minutos',
    difficulty: 'Fácil',
    objective: 'Completar tu cartón antes que los demás jugadores según la variante jugada.',
    rules: [
      'Compra de 1 a 20 cartones antes de que inicie el sorteo por sala.',
      'Las ventas se cierran automáticamente 10 segundos antes de comenzar la extracción.',
      'Cuenta regresiva de 3 minutos: Se activa de inmediato al haber un mínimo de 2 jugadores con cartones.',
      'Modo 75 Bolas: Dos premios por sorteo (Línea o Patrón + Cartón Lleno).',
      'Modo 90 Bolas: Sorteo tradicional de cartón completo (1 ganador del pozo mayor).',
      'El pozo se distribuye 90% directo a los ganadores y 10% de comisión de plataforma.',
      'Extracción automática transparente en blockchain/servidor cada 2 segundos sin pausas.'
    ],
    tips: [
      'Compra varios cartones para maximizar tu cobertura numérica en el bombo.',
      'Observa el cronómetro digital neón: las ventas se bloquean estrictamente a los 10 segundos.',
      'Las balotas se marcan de manera automática en todos tus cartones activos.'
    ]
  },
  {
    id: 'atrapaito',
    aliases: ['atrapaito_criollo'],
    title: 'Atrapaíto Criollo (1v1 Táctico)',
    description: 'Estrategia pura 1v1. Bloquea a tu rival con muros 3D y cruza la meta primero.',
    icon: '🎯',
    isHot: true,
    category: 'estrategia',
    players: '2 jugadores (1v1)',
    duration: '5 a 15 minutos',
    difficulty: 'Medio',
    objective: 'Ser el primero en llevar tu canica criolla a cualquier casilla de la fila superior (META FINAL).',
    rules: [
      'Cada jugador dispone de 10 muros tácticos por partida.',
      'En tu turno puedes: Mover tu canica 1 casilla ortogonal O colocar 1 muro táctico.',
      'Los muros miden 2 casillas y bloquean el paso tanto del rival como el tuyo.',
      'Salto Criollo: Si el rival está frente a ti, puedes saltar sobre él o esquivarlo en diagonal.',
      'Ley de Camino Libre: Está prohibido encerrar al rival sin dejarle al menos una salida hacia la meta.',
      'Empate Técnico: Si ambos jugadores quedan atrapados sin movimientos ni muros válidos, se declara EMPATE.',
      'Primer Empate: Se reinicia la partida automáticamente para una revancha limpia.',
      'Segundo Empate Consecutivo: Gana el jugador que se encuentre a menor distancia de la META (cálculo BFS).'
    ],
    tips: [
      'Administra tus 10 muros; no los gastes todos al inicio.',
      'Observa la distancia a la meta: a veces avanzar es más efectivo que intentar bloquear.',
      'Usa el salto criollo para avanzar dos casillas de golpe cuando el rival se te acerque.',
      'Mantén siempre presente que la meta es cualquier casilla de la fila 0.'
    ]
  },
  {
    id: 'domino_venezolano',
    aliases: ['domino'],
    title: 'Dominó Venezolano',
    description: 'El clásico de tranca y capicúa. Modalidad individual y por parejas a 100 puntos.',
    icon: '🁐',
    isHot: true,
    category: 'cartas',
    players: '2 a 4 jugadores',
    duration: '15 a 30 minutos',
    difficulty: 'Medio',
    objective: 'Colocar todas las fichas en la mesa o sumar menos puntos en caso de tranca.',
    rules: [
      'Se juega con las 28 fichas clásicas (Doble Blanco al Doble Seis).',
      'Cada jugador recibe 7 fichas al inicio de la mano.',
      'Abre la primera mano quien posea el Doble Seis (6-6).',
      'Coloca fichas que coincidan con los números de los extremos abiertos.',
      'Tranca: Cuando nadie puede jugar, gana quien o cuya pareja acumule menor puntaje en mano.',
      'Capicúa: Cerrar la mano colocando una ficha que cuadre por ambos extremos abiertos.',
      'La partida se gana al alcanzar 100 puntos acumulados.'
    ],
    tips: [
      'Juega tus fichas dobles tempranamente para no quedarte con puntos altos en una tranca.',
      'Observa qué números castigan o pasan tus rivales para controlar los extremos.',
      'Si juegas en parejas, coopera con tu compañero deduciendo sus salidas.'
    ]
  },
  {
    id: 'truco_venezolano',
    aliases: ['truco'],
    title: 'Truco Venezolano',
    description: 'Envido, Flor, Truco, Retruco y Vale Cuatro con baraja española.',
    icon: '🃏',
    isHot: true,
    category: 'cartas',
    players: '2 a 4 jugadores',
    duration: '20 a 40 minutos',
    difficulty: 'Difícil',
    objective: 'Ser la primera pareja o jugador en alcanzar 24 puntos (o 30 puntos en mesa larga).',
    rules: [
      'Baraja española de 40 cartas (sin 8s ni 9s).',
      'Cantos de Envido: Envido (2 pts), Real Envido (3 pts), Falta Envido.',
      'Canto de Flor: 3 cartas del mismo palo (vale 3 puntos).',
      'Truco (2 pts), Retruco (3 pts), Vale Cuatro (4 pts).',
      'Jerarquía de cartas: Espada Mayor (1 de espadas), Basto Mayor (1 de bastos), 7 de espadas, 7 de oros.',
      'El farol y la picardía criolla son legales y fundamentales.'
    ],
    tips: [
      'Aprende a mentir con cartas bajas para forzar el repliegue del oponente.',
      'Guarda tus cartas mayores para la segunda o tercera baza decisiva.',
      'No cantes Truco de inmediato si tienes una mano ganadora; deja que el rival se confíe.'
    ]
  },
  {
    id: 'chess',
    aliases: ['ajedrez'],
    title: 'Ajedrez Criollo',
    description: 'Duelo mental 8x8 con reglas FIDE y reloj dinámico por turno.',
    icon: '♟️',
    isHot: false,
    category: 'estrategia',
    players: '2 jugadores (1v1)',
    duration: '10 a 30 minutos',
    difficulty: 'Difícil',
    objective: 'Dar jaque mate al rey rival impidiendo cualquier escape legal.',
    rules: [
      'Tablero de 64 casillas con piezas estándar: Rey, Dama, Torres, Alfiles, Caballos y Peones.',
      'Movimientos oficiales FIDE: Enroque corto y largo, captura al paso y promoción de peón.',
      'Reloj de turno con tiempo límite por jugada para garantizar dinamismo.',
      'Jaque, jaque mate y tablas (ahogado, repetición triple, insuficiencia material o 50 jugadas).',
      'No se permite realizar movimientos que dejen a tu propio rey en jaque.'
    ],
    tips: [
      'Domina las 4 casillas centrales en la apertura (d4, d5, e4, e5).',
      'Desarrolla caballos y alfiles antes de exponer la dama prematuramente.',
      'Enroca temprano para asegurar la vida de tu rey.'
    ]
  },
  {
    id: 'checkers',
    aliases: ['damas'],
    title: 'Damas Venezolanas',
    description: 'Tablero 8x8, capturas diagonales obligatorias y coronación de damas.',
    icon: '⚪',
    isHot: false,
    category: 'estrategia',
    players: '2 jugadores (1v1)',
    duration: '10 a 20 minutos',
    difficulty: 'Medio',
    objective: 'Capturar todas las fichas del oponente o inmovilizarlo sin jugadas legales.',
    rules: [
      'Fichas sobre casillas oscuras con desplazamiento diagonal hacia adelante.',
      'Captura Obligatoria: Si tienes la posibilidad de saltar y capturar una ficha rival, debes hacerlo.',
      'Capturas Múltiples: Si tras capturar puedes continuar saltando, debes completar la cadena.',
      'Coronación: Al alcanzar la última fila, la ficha se corona como Dama con movimiento bidireccional.'
    ],
    tips: [
      'Mantén tu línea trasera protegida el mayor tiempo posible para evitar coronaciones tempranas.',
      'Provoca sacrificios tácticos de una ficha para capturar dos o más del rival en respuesta.',
      'Domina el centro del tablero para mantener opciones de salto abiertas.'
    ]
  },
  {
    id: 'tictactoe',
    aliases: ['la_vieja'],
    title: 'La Vieja (3 en Raya)',
    description: 'Duelo instantáneo 3x3 de velocidad y agilidad mental.',
    icon: '❌',
    isHot: false,
    category: 'estrategia',
    players: '2 jugadores (1v1)',
    duration: '1 a 3 minutos',
    difficulty: 'Fácil',
    objective: 'Alinear 3 símbolos propios (X u O) en línea recta horizontal, vertical o diagonal.',
    rules: [
      'Cuadrícula compacta de 3x3.',
      'Los jugadores alternan turnos colocando una marca.',
      'Gana quien alinee primero tres marcas seguidas.',
      'Si se ocupan las 9 casillas sin alineación, se declara empate (partida trancada).'
    ],
    tips: [
      'La casilla central otorga el mayor número de líneas de victoria posibles (4 en total).',
      'Ocupa las esquinas si el centro está ocupado para crear dobles amenazas de victoria.'
    ]
  },
  {
    id: 'rock_paper_scissors',
    aliases: ['rps', 'pulsoplay'],
    title: 'Piedra, Papel o Tijera (PulsoPLAY)',
    description: 'Duelo rápido 1v1 con commit-reveal criptográfico y rondas simultáneas.',
    icon: '✊',
    isHot: false,
    category: 'azar',
    players: '2 jugadores (1v1)',
    duration: '1 a 3 minutos',
    difficulty: 'Fácil',
    objective: 'Vencer la elección del rival y ganar el número estipulado de rondas.',
    rules: [
      'Piedra vence a Tijera.',
      'Tijera vence a Papel.',
      'Papel vence a Piedra.',
      'Ambos jugadores eligen en secreto simultáneamente.',
      'En caso de misma elección, la ronda se declara empatada y se repite de inmediato.'
    ],
    tips: [
      'Varía tus elecciones de forma impredecible; evita repetir secuencias fijas.',
      'Muchos jugadores principiantes suelen iniciar con Piedra.'
    ]
  },
  {
    id: 'una_olla',
    aliases: ['unaolla'],
    title: 'UNA-OLLA (Juego de Cartas)',
    description: 'Baraja de 108 cartas de colores y acción con canto obligatorio de ¡UNA-OLLA!',
    icon: '🔥',
    isHot: true,
    category: 'cartas',
    players: '2 a 6 jugadores',
    duration: '10 a 25 minutos',
    difficulty: 'Medio',
    objective: 'Descartar todas las cartas de tu mano antes que tus oponentes.',
    rules: [
      'Baraja de 108 cartas: Colores Azul, Rojo, Amarillo y Verde (0 al 9), +2, Salto, Reversa y Comodines (+4).',
      'Descarta por coincidencia de color, número o símbolo activo en la mesa.',
      'Canto Obligatorio: Al quedarte con exactamente 1 carta en mano, debes cantar ¡UNA-OLLA! de inmediato.',
      'Penalización de 2 cartas si otro jugador te descubre antes de tu canto oficial.',
      'Cartas de Acción: +2 obliga a robar 2 cartas, +4 cambia de color y penaliza al siguiente.'
    ],
    tips: [
      'Presiona el botón de ¡UNA-OLLA! inmediatamente antes de soltar tu penúltima carta.',
      'Reserva tus cartas comodín +4 para cambiar a tu color predominante en el tramo final.',
      'Observa qué colores roba el oponente para bloquearlo sistemáticamente.'
    ]
  },
  {
    id: 'polla_venezolana',
    aliases: ['polla'],
    title: 'Polla Venezolana (77 Animalitos)',
    description: 'Quiniela tradicional de 77 animalitos con sorteos diarios matutinos y vespertinos.',
    icon: '🐴',
    isHot: false,
    category: 'sorteo',
    players: 'Comunidad Ilimitada',
    duration: 'Sorteos por bloques',
    difficulty: 'Fácil',
    objective: 'Acertar el animalito ganador seleccionado en el sorteo oficial.',
    rules: [
      '77 figuras tradicionales de la fauna y cultura venezolana numeradas del 00 al 76.',
      'Dos bloques de participación: Bloque Mañana y Bloque Tarde.',
      'El pozo acumulado de apuestas se reparte entre los boletos que contengan el animalito triunfador.',
      'Comprobante digital seguro con hash criptográfico para cada ticket emitido.'
    ],
    tips: [
      'Diversifica tus boletos en varios animalitos para ampliar tu probabilidad de acierto.',
      'Revisa la pizarra histórica de resultados anteriores para detectar rachas.'
    ]
  }
];

export function getGameInfo(gameId: string): GameInfo | undefined {
  if (!gameId) return undefined;
  const cleanId = gameId.toLowerCase().trim();
  return GAMES_INFO.find(
    (g) => g.id === cleanId || (g.aliases && g.aliases.includes(cleanId))
  );
}

export function getGamesByCategory(category: GameInfo['category']): GameInfo[] {
  return GAMES_INFO.filter((game) => game.category === category);
}
