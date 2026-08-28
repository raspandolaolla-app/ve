// ==============================================================================
// RASPANDO LA OLLA — VISTA PRINCIPAL: LOBBY DE JUEGOS Y SORTEOS
// ==============================================================================

import React from 'react';
import { SUPPORTED_GAMES_METADATA, GLOBAL_DRAWS_METADATA } from '../../utils/constants';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { MediaBanner } from '../../components/common/MediaBanner';
import { InstallPWAButton } from '../../components/common/InstallPWAButton';
import { Users, Coins, Sparkles, Play, Award, Sun, Moon, ArrowRight } from 'lucide-react';
import type { GameMetadata } from '../../types/games';

interface LobbyViewProps {
  onSelectGame: (game: GameMetadata) => void;
  onJoinTrancaito: () => void;
  onNavigateTab?: (tab: string) => void;
}

export function LobbyView({ onSelectGame, onJoinTrancaito, onNavigateTab }: LobbyViewProps) {
  const pollaMetadata = GLOBAL_DRAWS_METADATA[0];

  return (
    <div id="lobby-view" className="space-y-8">
      {/* Banner de Contenido Administrable / Banners Activos */}
      <MediaBanner location="HOME" onNavigateTab={onNavigateTab} />

      {/* Banner Principal del Lobby */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-amber-950/80 via-slate-900 to-slate-950 border border-amber-500/20 p-6 sm:p-8 shadow-2xl">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>PLATAFORMA MULTIJUGADOR Y SORTEOS EN VIVO</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-100 tracking-tight">
            Selecciona tu juego o participa en la Polla Venezolana
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Mesas públicas con emparejamiento automático o partidas privadas <strong className="text-amber-400">"Trancaíto"</strong> con tus amigos.
            Sorteos diarios de Polla Venezolana auditados con la regla 90/10.
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

            {onNavigateTab && (
              <Button
                id="lobby-goto-polla-btn"
                variant="outline"
                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                onClick={() => onNavigateTab('polla')}
                leftIcon={<Award className="w-4 h-4 text-amber-400" />}
              >
                🐾 Sorteo Polla Venezolana
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Botón / Tarjeta de Instalación PWA Directa */}
      <InstallPWAButton variant="lobby" />

      {/* SECCIÓN DESTACADA: SORTEO GLOBAL PERMANENTE — POLLA VENEZOLANA */}
      <div id="section-global-draws" className="space-y-4">
        <MediaBanner location="POLLA" onNavigateTab={onNavigateTab} />
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h2 className="text-xl font-black text-slate-100 uppercase tracking-wide">
                🐾 Sorteo Diario Global — Polla Venezolana
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Sorteo comunitario con pozo acumulado. Selecciona tus 6 animalitos (00 a 76 sin repetir).
            </p>
          </div>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('polla')}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
            >
              <span>Ver Pantalla Completa de Polla</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-950 p-6 shadow-2xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-3 max-w-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-2xl font-black shadow-inner">
                  🐾
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-100">Polla Venezolana (Animalitos)</h3>
                  <div className="flex items-center gap-3 text-xs text-slate-300 mt-0.5">
                    <span className="font-mono text-amber-300 font-bold">Precio Ticket: 250 Bs</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-bold">Premio: 90% del Pozo Acumulado</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center gap-3">
                  <Sun className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-200">Turno Mañana</div>
                    <div className="text-[11px] text-slate-400 font-mono">Sorteo a las 07:55 AM</div>
                  </div>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center gap-3">
                  <Moon className="w-5 h-5 text-indigo-400 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-200">Turno Tarde</div>
                    <div className="text-[11px] text-slate-400 font-mono">Sorteo a las 05:55 PM</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full md:w-auto flex flex-col items-stretch md:items-end gap-3 shrink-0">
              <Button
                id="btn-buy-polla-lobby"
                variant="primary"
                size="lg"
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm px-8 py-3 rounded-xl shadow-lg shadow-amber-500/20"
                onClick={() => {
                  if (onNavigateTab) onNavigateTab('polla');
                }}
                leftIcon={<Award className="w-5 h-5" />}
              >
                🐾 COMPRAR POLLA VENEZOLANA
              </Button>
              <span className="text-[11px] text-slate-400 text-center md:text-right font-mono">
                Sorteo automático permanente. Sin límite de jugadores.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* CATÁLOGO DE JUEGOS CON MESAS Y SALAS */}
      <div id="section-table-games" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">🎮 Juegos con Mesas y Salas</h2>
            <p className="text-xs text-slate-400">7 juegos multijugador por turnos en tiempo real con validación server-side</p>
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

      {/* SECCIONES ADICIONALES DE CONTENIDO: PROMOCIONES E INFORMACIÓN */}
      <MediaBanner location="PROMOTIONS" onNavigateTab={onNavigateTab} />
      <MediaBanner location="INFO" onNavigateTab={onNavigateTab} />
    </div>
  );
}
