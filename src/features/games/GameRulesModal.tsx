import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  X,
  Gamepad2,
  Award,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Lightbulb,
  Flame,
  Users,
  Video,
  Sparkles,
} from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { GAMES_INFO, getGameInfo, GameInfo } from '../../data/gameInfo';
import { GameTutorialPlayer } from '../../components/video/GameTutorialPlayer';
import type { GameManualItem, GameTutorialVideo } from '../../types/admin';

interface GameRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultGameId?: string;
  defaultTab?: 'rules' | 'video';
}

export const GameRulesModal: React.FC<GameRulesModalProps> = ({
  isOpen,
  onClose,
  defaultGameId = 'atrapaito',
  defaultTab = 'rules',
}) => {
  const [selectedGame, setSelectedGame] = useState<string>(defaultGameId);
  const [manual, setManual] = useState<GameManualItem | null>(null);
  const [tutorialVideo, setTutorialVideo] = useState<GameTutorialVideo | null>(null);
  const [activeTab, setActiveTab] = useState<'rules' | 'video'>(defaultTab);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (defaultGameId) {
      setSelectedGame(defaultGameId);
    }
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultGameId, defaultTab]);

  const activeGameInfo: GameInfo | undefined = getGameInfo(selectedGame);

  useEffect(() => {
    if (!isOpen) return;

    const fetchManualAndVideo = async () => {
      setLoading(true);
      const supabase = getSupabaseClient();
      if (!supabase) {
        setManual(null);
        setTutorialVideo(null);
        setLoading(false);
        return;
      }

      try {
        const [manualRes, configRes] = await Promise.all([
          supabase
            .from('game_manuals')
            .select('*')
            .eq('game_id', selectedGame)
            .maybeSingle(),
          supabase
            .from('game_configurations')
            .select('config')
            .eq('game_id', selectedGame)
            .maybeSingle(),
        ]);

        if (!manualRes.error && manualRes.data) {
          setManual({
            gameId: manualRes.data.game_id,
            title: manualRes.data.title,
            objective: manualRes.data.objective,
            playersInfo: manualRes.data.players_info,
            preparation: manualRes.data.preparation,
            turnRules: manualRes.data.turn_rules,
            winningRules: manualRes.data.winning_rules,
            scoringRules: manualRes.data.scoring_rules,
            disconnectionRules: manualRes.data.disconnection_rules,
            cancellationRules: manualRes.data.cancellation_rules,
            fullContentMarkdown: manualRes.data.full_content_markdown,
            updatedAt: manualRes.data.updated_at,
          });
        } else {
          setManual(null);
        }

        const tut = configRes.data?.config?.tutorialVideo;
        if (!configRes.error && tut && tut.enabled && tut.url) {
          setTutorialVideo(tut);
        } else {
          setTutorialVideo(null);
          // Si no hay video y estábamos en tab video, regresar a rules
          setActiveTab('rules');
        }
      } catch {
        setManual(null);
        setTutorialVideo(null);
      } finally {
        setLoading(false);
      }
    };

    fetchManualAndVideo();
  }, [isOpen, selectedGame]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">
                Reglamento Oficial & Manual de Juego
              </h2>
              <p className="text-xs text-slate-400">
                Reglas auditadas, mecánicas, desempates y conducción de todos los juegos de la plataforma
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Game Tabs Selector */}
        <div className="bg-slate-950/40 border-b border-slate-800 px-4 sm:px-6 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {GAMES_INFO.map((g) => {
            const isSelected = selectedGame === g.id || (g.aliases && g.aliases.includes(selectedGame));
            return (
              <button
                key={g.id}
                onClick={() => setSelectedGame(g.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 shadow-md scale-105'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span>{g.icon}</span>
                <span>{g.title.split('(')[0].trim()}</span>
                {g.isHot && (
                  <Flame className={`w-3 h-3 ${isSelected ? 'text-slate-950' : 'text-rose-500'}`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-slate-200 text-sm">
          {loading ? (
            <div className="py-16 text-center text-slate-500">Cargando reglamento oficial...</div>
          ) : activeGameInfo ? (
            <>
              {/* Encabezado del Juego */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{activeGameInfo.icon}</span>
                    <h3 className="text-xl font-black text-amber-400">{activeGameInfo.title}</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{activeGameInfo.description}</p>
                </div>
              </div>

              {/* Badges y Selector de Vista si existe Video Tutorial */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                {/* Selector de modo si hay video tutorial configurado */}
                {tutorialVideo ? (
                  <div className="flex items-center gap-1.5 p-1 bg-slate-950/90 rounded-xl border border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab('rules')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        activeTab === 'rules'
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Instrucciones Escritas</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('video')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        activeTab === 'video'
                          ? 'bg-sky-500 text-slate-950 shadow'
                          : 'text-sky-400 hover:text-sky-300'
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Video Tutorial ({tutorialVideo.platform.toUpperCase()})</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </button>
                  </div>
                ) : null}

                {/* Badges de Dificultad, Duración y Jugadores */}
                <div className="flex items-center gap-2 text-xs ml-auto">
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 text-sky-300 border border-slate-700/60">
                    <Users className="w-3.5 h-3.5" />
                    <span>{activeGameInfo.players}</span>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 text-amber-300 border border-slate-700/60">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{activeGameInfo.duration}</span>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/80 text-emerald-300 border border-slate-700/60">
                    <Award className="w-3.5 h-3.5" />
                    <span>{activeGameInfo.difficulty}</span>
                  </div>
                </div>
              </div>

              {/* VISTA 1: VIDEO TUTORIAL */}
              {activeTab === 'video' && tutorialVideo ? (
                <div className="py-2 space-y-4">
                  <GameTutorialPlayer
                    video={tutorialVideo}
                    gameTitle={activeGameInfo.title}
                    showDetails={true}
                  />

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('rules')}
                      className="text-xs text-amber-400/90 hover:text-amber-300 underline font-medium cursor-pointer"
                    >
                      Ver también las especificaciones y reglas completas por escrito →
                    </button>
                  </div>
                </div>
              ) : (
                /* VISTA 2: INSTRUCCIONES ESCRITAS TRADICIONALES */
                <>
                  {/* Banner discreto si existe video tutorial disponible */}
                  {tutorialVideo && (
                    <div className="flex items-center justify-between gap-3 p-3 bg-sky-500/10 border border-sky-500/20 rounded-2xl text-xs text-sky-300">
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4 text-sky-400 shrink-0" />
                        <span>Este juego cuenta con un video tutorial oficial explicativo.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('video')}
                        className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-slate-950 font-bold rounded-lg shrink-0 transition cursor-pointer"
                      >
                        Ver Video
                      </button>
                    </div>
                  )}

                  {/* Grid de Secciones */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Objetivo */}
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                        <Award className="w-4 h-4" /> Objetivo Oficial
                      </div>
                      <p className="text-slate-300 text-xs leading-relaxed font-medium">
                        {manual?.objective || activeGameInfo.objective}
                      </p>
                    </div>

                    {/* Preparación o Dinámica */}
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400 mb-2">
                        <Gamepad2 className="w-4 h-4" /> Estructura de Mesa & Reparto
                      </div>
                      <p className="text-slate-300 text-xs leading-relaxed font-medium">
                        {manual?.preparation ||
                          `Partidas configuradas para ${activeGameInfo.players} con duración promedio de ${activeGameInfo.duration} y supervisión automática del pozo.`}
                      </p>
                    </div>
                  </div>

                  {/* Lista Detallada de Reglas */}
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3">
                      <CheckCircle2 className="w-4 h-4" /> Reglas de Conducción & Desempates
                    </div>
                    <div className="space-y-2">
                      {activeGameInfo.rules.map((rule, idx) => (
                        <div
                          key={idx}
                          className="flex gap-2.5 text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/40"
                        >
                          <span className="text-amber-400 font-bold shrink-0">{idx + 1}.</span>
                          <span className="leading-relaxed">{rule}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Consejos Tácticos */}
                  {activeGameInfo.tips && activeGameInfo.tips.length > 0 && (
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                        <Lightbulb className="w-4 h-4" /> Consejos Tácticos para Ganar
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {activeGameInfo.tips.map((tip, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-emerald-400 font-bold shrink-0">✓</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Protocolos de Seguridad y Desconexión */}
                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" /> Protocolos de Red, Desconexión & Reembolso
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400">
                      <div>
                        <strong className="text-slate-300 block mb-1">Desconexiones y Tolerancia:</strong>
                        {manual?.disconnectionRules ||
                          '60 segundos de gracia para reconexión antes de ceder turno o declarar abandono.'}
                      </div>
                      <div>
                        <strong className="text-slate-300 block mb-1">Garantía y Distribución 90/10:</strong>
                        {manual?.cancellationRules ||
                          '100% de reembolso si la mesa se cancela antes de iniciar. 90% neto al ganador en partidas completadas.'}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Reglamento oficial validado por la plataforma • Distribución 90/10 garantizada.
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
