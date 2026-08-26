import React, { useState, useEffect } from 'react';
import { BookOpen, X, Gamepad2, Award, Clock, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { GameManualItem } from '../../types/admin';

interface GameRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGameId?: string;
}

const FALLBACK_MANUALS: Record<string, GameManualItem> = {
  domino_venezolano: {
    gameId: 'domino_venezolano',
    title: 'Dominó Venezolano Clásico (100 Puntos)',
    objective: 'El objetivo es alcanzar 100 puntos acumulados por rondas antes que los rivales.',
    playersInfo: '4 jugadores en 2 parejas enfrentadas (o individual de 2 a 4).',
    preparation: 'Se juega con 28 fichas (Doble 6 al Blanco). Se reparten 7 fichas a cada jugador.',
    turnRules: 'Abre la primera mano quien tenga el Doble Seis (6-6). En las siguientes manos abre quien ganó o salió.',
    winningRules: 'Gana la pareja o jugador que primero coloque todas sus fichas (Dominó) o quien tenga menor conteo en una tranca.',
    scoringRules: 'El ganador suma los puntos restantes de los oponentes. La partida concluye al alcanzar 100 puntos.',
    disconnectionRules: '60 segundos de gracia. Si no regresa, el bot juega la ficha legal más alta o se declara abandono.',
    cancellationRules: '100% de reembolso si la mesa se cancela antes de colocar la primera ficha.',
    fullContentMarkdown: '# Dominó Venezolano Oficial\n\n...',
    updatedAt: new Date().toISOString(),
  },
  truco_venezolano: {
    gameId: 'truco_venezolano',
    title: 'Truco Venezolano Clásico (Flor y Envido)',
    objective: 'Alcanzar 24 puntos (Buenas) acumulando puntos mediante Truco, Retruco, Vale Cuatro, Envido y Flor.',
    playersInfo: '4 jugadores en 2 parejas (o 2 jugadores mano a mano).',
    preparation: 'Mazo español de 40 cartas sin 8s ni 9s.',
    turnRules: 'Se juegan 3 rondas por mano para definir la baza mayor.',
    winningRules: 'La primera pareja en llegar a 24 puntos gana la partida y el pozo del 90%.',
    scoringRules: 'Envido vale 2 puntos, Flor vale 3 puntos, Truco ganado vale 1, 2, 3 o 4 puntos.',
    disconnectionRules: '60 segundos de reconexión. El compañero no puede ver las cartas del desconectado.',
    cancellationRules: 'Reembolso total garantizado en caso de falla técnica del servidor.',
    fullContentMarkdown: '# Truco Venezolano Oficial\n\n...',
    updatedAt: new Date().toISOString(),
  },
};

export const GameRulesModal: React.FC<GameRulesModalProps> = ({
  isOpen,
  onClose,
  defaultGameId = 'domino_venezolano',
}) => {
  const [selectedGame, setSelectedGame] = useState<string>(defaultGameId);
  const [manual, setManual] = useState<GameManualItem | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (defaultGameId) {
      setSelectedGame(defaultGameId);
    }
  }, [defaultGameId]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchManual = async () => {
      setLoading(true);
      const supabase = getSupabaseClient();
      if (!supabase) {
        setManual(FALLBACK_MANUALS[selectedGame] || FALLBACK_MANUALS.domino_venezolano);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('game_manuals')
          .select('*')
          .eq('game_id', selectedGame)
          .single();

        if (!error && data) {
          setManual({
            gameId: data.game_id,
            title: data.title,
            objective: data.objective,
            playersInfo: data.players_info,
            preparation: data.preparation,
            turnRules: data.turn_rules,
            winningRules: data.winning_rules,
            scoringRules: data.scoring_rules,
            disconnectionRules: data.disconnection_rules,
            cancellationRules: data.cancellation_rules,
            fullContentMarkdown: data.full_content_markdown,
            updatedAt: data.updated_at,
          });
        } else {
          setManual(FALLBACK_MANUALS[selectedGame] || FALLBACK_MANUALS.domino_venezolano);
        }
      } catch {
        setManual(FALLBACK_MANUALS[selectedGame] || FALLBACK_MANUALS.domino_venezolano);
      } finally {
        setLoading(false);
      }
    };

    fetchManual();
  }, [isOpen, selectedGame]);

  if (!isOpen) return null;

  const gamesList = [
    { id: 'domino_venezolano', name: 'Dominó Venezolano' },
    { id: 'truco_venezolano', name: 'Truco Venezolano' },
    { id: 'caida_venezolana', name: 'Caída Venezolana' },
    { id: 'ludo_criollo', name: 'Ludo Criollo' },
    { id: 'bolas_criollas', name: 'Bolas Criollas' },
    { id: 'pelotica_goma', name: 'Pelotica de Goma' },
    { id: 'chapitas', name: 'Chapitas' },
    { id: 'kino_criollo', name: 'Kino Criollo' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Reglamento Oficial & "¿Cómo Jugar?"</h2>
              <p className="text-xs text-slate-400">Reglas auditadas y oficiales de los 8 juegos tradicionales venezolanos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Game Tabs Selector */}
        <div className="bg-slate-950/40 border-b border-slate-800 px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {gamesList.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGame(g.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedGame === g.id
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-sm">
          {loading ? (
            <div className="py-16 text-center text-slate-500">Cargando reglamento oficial...</div>
          ) : manual ? (
            <>
              <div>
                <h3 className="text-xl font-bold text-amber-400 mb-2">{manual.title}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono font-semibold">
                    {manual.playersInfo}
                  </span>
                  <span>• Actualizado recientemente por la administración</span>
                </div>
              </div>

              {/* Grid de Secciones */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                    <Award className="w-4 h-4" /> Objetivo del Juego
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">{manual.objective}</p>
                </div>

                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400 mb-2">
                    <Gamepad2 className="w-4 h-4" /> Preparación y Reparto
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">{manual.preparation}</p>
                </div>

                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    <Clock className="w-4 h-4" /> Turnos y Jugabilidad
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">{manual.turnRules}</p>
                </div>

                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400 mb-2">
                    <CheckCircle2 className="w-4 h-4" /> Victoria y Puntuación
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">{manual.winningRules}</p>
                </div>
              </div>

              {/* Protocolos de Seguridad y Desconexión */}
              <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Protocolos de Seguridad y Reembolso
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400">
                  <div>
                    <strong className="text-slate-300 block mb-1">Desconexiones y Abandono:</strong>
                    {manual.disconnectionRules}
                  </div>
                  <div>
                    <strong className="text-slate-300 block mb-1">Cancelación y Reembolsos:</strong>
                    {manual.cancellationRules}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Reglamento garantizado por contratos de distribución 90/10.
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
