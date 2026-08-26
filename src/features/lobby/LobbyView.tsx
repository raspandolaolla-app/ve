// ==============================================================================
// RASPANDO LA OLLA — VISTA PRINCIPAL: LOBBY DE JUEGOS
// ==============================================================================

import { SUPPORTED_GAMES_METADATA } from '../../utils/constants';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Users, Coins, Sparkles, Play } from 'lucide-react';
import type { GameMetadata } from '../../types/games';

interface LobbyViewProps {
  onSelectGame: (game: GameMetadata) => void;
  onJoinTrancaito: () => void;
}

export function LobbyView({ onSelectGame, onJoinTrancaito }: LobbyViewProps) {
  return (
    <div id="lobby-view" className="space-y-8">
      {/* Banner Principal del Lobby */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-amber-950/80 via-slate-900 to-slate-950 border border-amber-500/20 p-6 sm:p-8 shadow-2xl">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>MESAS EN TIEMPO REAL</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-100 tracking-tight">
            Selecciona tu juego y entra a la mesa
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Mesas públicas con emparejamiento automático o partidas privadas <strong className="text-amber-400">"Trancaíto"</strong> con tus amigos.
            Todas las partidas auditadas y protegidas por la regla 90/10.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              id="lobby-join-trancaito-btn"
              variant="primary"
              onClick={onJoinTrancaito}
              leftIcon={<Play className="w-4 h-4" />}
            >
              Unirse a Trancaíto (Privada)
            </Button>
          </div>
        </div>
      </div>

      {/* Catálogo de Juegos Soportados */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Juegos Tradicionales</h2>
            <p className="text-xs text-slate-400">8 modalidades con validación de jugadas en servidor</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SUPPORTED_GAMES_METADATA.map((game) => (
            <Card
              key={game.id}
              id={`game-card-${game.id}`}
              className="group hover:border-amber-500/40 transition-all duration-200 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-slate-100 text-base group-hover:text-amber-400 transition-colors">
                    {game.name}
                  </h3>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {game.allowedModes.join(', ')}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed min-h-[36px]">
                  {game.shortDescription}
                </p>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
                  <div className="flex items-center gap-1.5" title="Jugadores permitidos">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>{game.minPlayers === game.maxPlayers ? `${game.minPlayers} jug.` : `${game.minPlayers}-${game.maxPlayers} jug.`}</span>
                  </div>

                  <div className="flex items-center gap-1.5" title="Rango de entrada">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-medium text-amber-300">{game.minEntryFee} - {game.maxEntryFee} Bs.</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-2">
                <Button
                  id={`btn-open-game-${game.id}`}
                  variant="secondary"
                  size="sm"
                  className="w-full group-hover:bg-amber-600 group-hover:text-slate-950 group-hover:border-amber-500 transition-colors font-semibold"
                  onClick={() => onSelectGame(game)}
                >
                  Ver Mesas
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
