import React from 'react';
import {
  Home,
  Headphones,
  PlusCircle,
  Landmark,
  Menu,
  ChevronLeft,
  User,
  Ticket,
} from 'lucide-react';

/* ============================================================================
   TIPOS INTERNOS (solo presentación, sin tocar tipos globales del proyecto)
   ========================================================================= */

interface GameCardData {
  id: string;
  name: string;
  activeUsers: number;
  gradient: string;
  iconKey: 'domino' | 'truco' | 'ludo' | 'ppot';
}

interface TournamentData {
  id: string;
  gameName: string;
  iconKey: string;
  isFree: boolean;
}

/* ============================================================================
   SUB-COMPONENTES DE PRESENTACIÓN
   ========================================================================= */

/** Encabezado de sección: título en negrita + línea divisora + controles */
const SectionHeader: React.FC<{
  title: string;
  controls?: React.ReactNode;
}> = ({ title, controls }) => (
  <div className="flex items-center gap-3 mb-4">
    <h2 className="text-white font-bold text-base whitespace-nowrap">{title}</h2>
    <div className="flex-1 h-px bg-white/10" />
    {controls && <div className="flex items-center gap-2 shrink-0">{controls}</div>}
  </div>
);

/** Ilustración lateral de la tarjeta de juego (SVG inline tipo 3D) */
const GameIllustration: React.FC<{ iconKey: GameCardData['iconKey'] }> = ({ iconKey }) => {
  switch (iconKey) {
    case 'domino':
      return (
        <div className="relative w-14 h-14 flex items-center justify-center">
          {/* Fichas de dominó apiladas */}
          <div className="absolute w-8 h-12 bg-white rounded-lg shadow-lg transform -rotate-12 flex flex-col divide-y divide-gray-300 overflow-hidden">
            <div className="flex-1 flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
              <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
            </div>
            <div className="flex-1 flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
            </div>
          </div>
          <div className="absolute w-8 h-12 bg-gray-100 rounded-lg shadow-xl transform rotate-6 translate-x-2 flex flex-col divide-y divide-gray-300 overflow-hidden">
            <div className="flex-1 flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
              <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
              <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
            </div>
            <div className="flex-1 flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
              <span className="w-1.5 h-1.5 bg-gray-800 rounded-full" />
            </div>
          </div>
        </div>
      );
    case 'truco':
      return (
        <div className="relative w-14 h-14 flex items-center justify-center">
          {/* Cartas españolas en abanico */}
          <div className="absolute w-8 h-11 bg-amber-50 rounded-lg shadow-lg transform -rotate-15 border border-amber-200 flex items-center justify-center">
            <span className="text-red-600 text-lg font-black">7</span>
          </div>
          <div className="absolute w-8 h-11 bg-amber-50 rounded-lg shadow-xl transform rotate-3 translate-x-2 border border-amber-200 flex items-center justify-center">
            <span className="text-blue-700 text-lg font-black">12</span>
          </div>
          <div className="absolute w-8 h-11 bg-amber-50 rounded-lg shadow-xl transform rotate-15 translate-x-4 border border-amber-200 flex items-center justify-center">
            <span className="text-red-600 text-lg font-black">1</span>
          </div>
        </div>
      );
    case 'ludo':
      return (
        <div className="relative w-14 h-14 flex items-center justify-center">
          {/* Ficha de ludo + dado */}
          <div className="absolute w-7 h-9 bg-white rounded-full shadow-lg border-b-4 border-gray-300 transform -translate-x-2 flex items-start justify-center pt-1">
            <span className="w-4 h-4 bg-red-500 rounded-full shadow-inner" />
          </div>
          <div className="absolute w-7 h-7 bg-white rounded-md shadow-xl transform rotate-12 translate-x-3 flex items-center justify-center">
            <span className="text-gray-800 text-sm font-black">5</span>
          </div>
        </div>
      );
    case 'ppot':
      return (
        <div className="relative w-14 h-14 flex items-center justify-center gap-0.5">
          {/* Piedra, papel y tijera simplificados */}
          <div className="w-4 h-5 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-sm shadow-lg transform -rotate-12" title="Piedra" />
          <div className="w-4 h-6 bg-gradient-to-br from-blue-200 to-blue-400 rounded-sm shadow-xl" title="Papel" />
          <div className="w-1 h-6 bg-gradient-to-b from-gray-200 to-gray-400 rounded-full shadow-lg transform rotate-12" title="Tijera" />
        </div>
      );
    default:
      return null;
  }
};

/** Tarjeta individual de juego */
const GameCard: React.FC<{ game: GameCardData }> = ({ game }) => (
  <button
    id={`game-card-${game.id}`}
    className={`relative overflow-hidden rounded-2xl p-4 min-h-[110px] flex items-center justify-between text-left active:scale-95 transition-transform duration-150 bg-gradient-to-br ${game.gradient} shadow-lg`}
  >
    {/* Brillo decorativo de fondo */}
    <div className="absolute -top-8 -right-8 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />

    {/* Ilustración del juego */}
    <GameIllustration iconKey={game.iconKey} />

    {/* Información derecha */}
    <div className="flex flex-col items-end gap-2">
      <span className="text-white font-bold text-sm leading-tight">{game.name}</span>
      <span className="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm rounded-full px-2.5 py-1">
        {/* Punto verde "en línea" con efecto ping */}
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        <User size={12} className="text-white/80" />
        <span className="text-white text-xs font-semibold">{game.activeUsers}</span>
      </span>
    </div>
  </button>
);

/** Tarjeta de vista previa de torneo */
const TournamentCard: React.FC<{ tournament: TournamentData }> = ({ tournament }) => (
  <button
    id={`tournament-card-${tournament.id}`}
    className="w-full flex items-center justify-between bg-[#1A1C23] rounded-2xl p-4 border border-white/5 active:scale-[0.98] transition-transform duration-150 text-left"
  >
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center">
        <Ticket size={18} className="text-white" />
      </div>
      <span className="text-white font-semibold text-sm">{tournament.gameName}</span>
    </div>
    {tournament.isFree && (
      <span className="bg-emerald-500 text-black text-xs font-black px-3 py-1 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.5)]">
        GRATIS
      </span>
    )}
  </button>
);

/** Widget flotante: Ruleta de la Fortuna */
const RouletteWidget: React.FC = () => (
  <button
    id="roulette-floating-widget"
    className="absolute -top-8 right-4 w-14 h-14 rounded-full shadow-2xl border-4 border-[#1E2026] overflow-hidden active:scale-95 transition-transform z-20"
    aria-label="Ruleta de la Fortuna"
  >
    {/* Ruleta multicolor segmentada */}
    <svg viewBox="0 0 36 36" className="w-full h-full">
      <path d="M18 2 A16 16 0 0 1 34 18 L18 18 Z" fill="#EF4444" />
      <path d="M34 18 A16 16 0 0 1 18 34 L18 18 Z" fill="#22C55E" />
      <path d="M18 34 A16 16 0 0 1 2 18 L18 18 Z" fill="#3B82F6" />
      <path d="M2 18 A16 16 0 0 1 18 2 L18 18 Z" fill="#F97316" />
      <circle cx="18" cy="18" r="4" fill="#FFFFFF" />
    </svg>
  </button>
);

/** Barra de navegación inferior */
const BottomNavBar: React.FC = () => {
  const items = [
    { label: 'Inicio', icon: Home, id: 'btn-juegos-nav-home' },
    { label: 'Soporte', icon: Headphones, id: 'btn-juegos-nav-support' },
    { label: 'Abonar', icon: PlusCircle, id: 'btn-juegos-nav-deposit' },
    { label: 'Retirar', icon: Landmark, id: 'btn-juegos-nav-withdraw' },
    { label: 'Explorar', icon: Menu, id: 'btn-juegos-nav-explore' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-[#1E2026] rounded-t-2xl shadow-2xl z-10">
      <div className="relative flex items-end justify-around px-2 pt-2 pb-4">
        <RouletteWidget />
        {items.map(({ label, icon: Icon, id }) => (
          <button
            key={label}
            id={id}
            className="flex flex-col items-center gap-1 min-w-[60px] active:scale-95 transition-transform"
          >
            <Icon size={22} className="text-white" strokeWidth={2} />
            <span className="text-white text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

/* ============================================================================
   VISTA PRINCIPAL: "JUEGOS"
   ========================================================================= */

export const JuegosView: React.FC = () => {
  // Datos estáticos de presentación (en producción se conectan a datos reales)
  const games: GameCardData[] = [
    {
      id: 'domino',
      name: 'Dominó',
      activeUsers: 119,
      gradient: 'from-blue-900 via-blue-700 to-blue-500',
      iconKey: 'domino',
    },
    {
      id: 'truco',
      name: 'Truco',
      activeUsers: 58,
      gradient: 'from-amber-900 via-orange-800 to-orange-600',
      iconKey: 'truco',
    },
    {
      id: 'ludo',
      name: 'Ludo',
      activeUsers: 21,
      gradient: 'from-emerald-800 via-emerald-600 to-teal-400',
      iconKey: 'ludo',
    },
    {
      id: 'ppot',
      name: 'PPoT',
      activeUsers: 0,
      gradient: 'from-violet-800 via-purple-700 to-purple-500',
      iconKey: 'ppot',
    },
  ];

  const tournaments: TournamentData[] = [
    { id: 't1', gameName: 'Dominó', iconKey: 'domino', isFree: true },
  ];

  return (
    <div id="juegos-mobile-view" className="min-h-screen bg-[#121318] px-4 pt-6 pb-32 font-sans">
      {/* ===== SECCIÓN: JUEGOS ===== */}
      <SectionHeader title="Juegos" />

      {/* Grid 2x2 de juegos */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>

      {/* ===== SECCIÓN: PRÓXIMOS TORNEOS ===== */}
      <SectionHeader
        title="Próximos Torneos"
        controls={
          <div className="flex items-center gap-2">
            <button
              id="btn-tournaments-prev"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 text-white/60 active:scale-95 transition-transform"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-white/60 text-xs font-medium">1</span>
          </div>
        }
      />

      {/* Lista de torneos */}
      <div className="space-y-3 mb-8">
        {tournaments.map((tournament) => (
          <TournamentCard key={tournament.id} tournament={tournament} />
        ))}
      </div>

      {/* ===== BARRA DE NAVEGACIÓN INFERIOR ===== */}
      <BottomNavBar />
    </div>
  );
};

export default JuegosView;
