// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: POLLA VENEZOLANA (QUINIELA ANIMALITOS 00-76)
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Clock, CheckCircle, AlertCircle, Sparkles, Ticket, ListFilter, Award, RefreshCw, Check, Download, ShieldCheck } from 'lucide-react';
import { ANIMALITOS_CATALOG, getAnimalitoByCode } from '../../../data/pollaAnimalitos';
import { PollaRepository, BlockSalesStatus, ShiftScheduleInfo } from '../../../services/repositories/PollaRepository';
import type { PollaBlockType, PollaTicket, PollaDrawResultItem, PollaBlockWinner } from '../../../types/games';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../../components/common/Button';
import { generatePollaTicketPng } from '../../../utils/pollaPngGenerator';

export const PollaBoard: React.FC = () => {
  const { profile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'NUEVA_POLLA' | 'MIS_POLLAS' | 'RESULTADOS' | 'GANADORES'>('NUEVA_POLLA');
  const [selectedBlock, setSelectedBlock] = useState<PollaBlockType>('MAÑANA');
  const [selectedDate, setSelectedDate] = useState<string>(PollaRepository.getTodayVenezuelaString());

  // Estado de selección de animalitos (exactamente 6 distintos)
  const [selectedAnimalCodes, setSelectedAnimalCodes] = useState<string[]>([]);
  
  // Estado operativo de la ventana de ventas y turnos
  const [salesStatus, setSalesStatus] = useState<BlockSalesStatus>(
    PollaRepository.getBlockSalesStatus('MAÑANA', selectedDate)
  );
  const [shiftSchedule, setShiftSchedule] = useState<ShiftScheduleInfo>(
    PollaRepository.getShiftSchedule()
  );
  const [countdownText, setCountdownText] = useState<string>('');

  // Estados de datos
  const [myTickets, setMyTickets] = useState<PollaTicket[]>([]);
  const [drawResults, setDrawResults] = useState<PollaDrawResultItem[]>([]);
  const [blockWinners, setBlockWinners] = useState<PollaBlockWinner[]>([]);
  const [poolStats, setPoolStats] = useState<{ totalTickets: number; totalBs: number }>({ totalTickets: 0, totalBs: 0 });
  const [loading, setLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [lastBoughtTicket, setLastBoughtTicket] = useState<PollaTicket | null>(null);

  // Actualizar estado de ventas y temporizador en tiempo real
  useEffect(() => {
    const updateSales = () => {
      const schedule = PollaRepository.getShiftSchedule();
      setShiftSchedule(schedule);

      const status = PollaRepository.getBlockSalesStatus(selectedBlock, selectedDate);
      setSalesStatus(status);

      if (status.isOpen && status.secondsUntilClose > 0) {
        const hrs = Math.floor(status.secondsUntilClose / 3600);
        const mins = Math.floor((status.secondsUntilClose % 3600) / 60);
        const secs = status.secondsUntilClose % 60;
        const text = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        setCountdownText(text);
      } else {
        setCountdownText('00:00:00');
      }
    };

    updateSales();
    const timer = setInterval(updateSales, 1000);
    return () => clearInterval(timer);
  }, [selectedBlock, selectedDate]);

  // Cargar datos según pestaña
  const loadData = async () => {
    setLoading(true);
    try {
      const [tickets, results, winners, stats] = await Promise.all([
        PollaRepository.getUserTickets(selectedDate, selectedBlock),
        PollaRepository.getDrawResults(selectedDate, selectedBlock),
        PollaRepository.getBlockWinners(selectedDate),
        PollaRepository.getDrawPoolStats(selectedDate, selectedBlock),
      ]);
      setMyTickets(tickets);
      setDrawResults(results);
      setBlockWinners(winners);
      setPoolStats(stats);
    } catch (err) {
      console.error('[PollaBoard] Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBlock, selectedDate, activeTab]);

  // Alternar selección de animalito
  const handleToggleAnimal = (code: string) => {
    if (salesStatus.statusText === 'VENTA CERRADA' || salesStatus.statusText === 'FINALIZADO') {
      setActionMessage({ text: 'Las ventas para este bloque están cerradas.', isError: true });
      return;
    }

    if (selectedAnimalCodes.includes(code)) {
      setSelectedAnimalCodes(selectedAnimalCodes.filter((c) => c !== code));
    } else {
      if (selectedAnimalCodes.length >= 6) {
        setActionMessage({ text: 'Ya has seleccionado el máximo de 6 animalitos.', isError: true });
        return;
      }
      setSelectedAnimalCodes([...selectedAnimalCodes, code]);
    }
    setActionMessage(null);
  };

  // Selección rápida aleatoria de 6 animalitos distintos
  const handleRandomFill = () => {
    const shuffled = [...ANIMALITOS_CATALOG].sort(() => Math.random() - 0.5);
    const random6 = shuffled.slice(0, 6).map((a) => a.code);
    setSelectedAnimalCodes(random6);
    setActionMessage(null);
  };

  // Limpiar selección
  const handleClearSelection = () => {
    setSelectedAnimalCodes([]);
    setActionMessage(null);
  };

  // Procesar compra de la Polla
  const handleBuyPolla = async () => {
    if (selectedAnimalCodes.length !== 6) {
      setActionMessage({ text: 'Debe seleccionar exactamente 6 animalitos distintos.', isError: true });
      return;
    }

    if (!salesStatus.isOpen) {
      setActionMessage({ text: 'La ventana de venta está cerrada.', isError: true });
      return;
    }

    const currentTicketsInBlock = myTickets.filter(
      (t) => t.block === selectedBlock && t.drawDate === selectedDate
    );
    if (currentTicketsInBlock.length >= 20) {
      setActionMessage({ text: 'Has alcanzado el límite máximo de 20 pollas para este turno.', isError: true });
      return;
    }

    setSubmitting(true);
    setActionMessage(null);

    const result = await PollaRepository.buyPollaTicket(selectedBlock, selectedDate, selectedAnimalCodes);

    setSubmitting(false);

    if (result.success) {
      const msg = result.message || 'SE DESCONTARON 250 Bs DE TU SALDO.';
      setActionMessage({ text: msg, isError: false });

      const newTicketObj: PollaTicket = {
        id: result.ticketId || genId(),
        userId: profile?.id || 'me',
        block: selectedBlock,
        drawDate: selectedDate,
        animalitos: [...selectedAnimalCodes],
        costBs: 250,
        hits: 0,
        status: 'PENDING',
        prizeBs: 0,
        createdAt: new Date().toISOString(),
        ticketNumber: result.ticketNumber,
        verificationCode: result.verificationCode,
        validationStatus: 'PENDING',
      };
      setLastBoughtTicket(newTicketObj);

      setSelectedAnimalCodes([]);
      await refreshProfile();
      await loadData();
    } else {
      setActionMessage({ text: result.error || 'No se pudo completar la compra.', isError: true });
    }
  };

  const genId = () => Math.random().toString(36).substring(2, 9);

  const handleDownloadTicketPng = (ticket: PollaTicket) => {
    const playerName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'JUGADOR';
    generatePollaTicketPng(ticket, playerName);
  };

  return (
    <div id="polla-board-container" className="flex flex-col items-center p-3 sm:p-5 max-w-4xl mx-auto w-full">
      {/* Encabezado Principal */}
      <div id="polla-header" className="w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-4 sm:p-6 mb-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-3 text-center sm:text-left">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-neutral-950 font-black text-2xl shadow-lg">
              🎰
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
                POLLA VENEZOLANA
              </h2>
              <p className="text-xs text-amber-400 font-medium">
                Quiniela de 6 Animalitos (00 a 76) • Sorteos Diarios por Turnos
              </p>
            </div>
          </div>

          {/* Tarjeta de Saldo y Precio */}
          <div className="flex items-center space-x-3 bg-neutral-800/80 border border-neutral-700/60 px-4 py-2.5 rounded-2xl">
            <div className="text-right">
              <span className="text-[10px] text-neutral-400 uppercase font-mono block">PRECIO POR POLLA</span>
              <span className="text-lg font-black text-amber-400 font-mono">250.00 Bs</span>
            </div>
          </div>
        </div>

        {/* Pestañas de Navegación */}
        <div className="flex items-center justify-around mt-5 bg-neutral-950/80 p-1.5 rounded-2xl border border-neutral-800/80">
          {[
            { id: 'NUEVA_POLLA', label: 'Jugar Polla', icon: Sparkles },
            { id: 'MIS_POLLAS', label: 'Mis Pollas', icon: Ticket },
            { id: 'RESULTADOS', label: 'Resultados', icon: ListFilter },
            { id: 'GANADORES', label: 'Ganadores', icon: Award },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-amber-500 text-neutral-950 shadow-md'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selector de Bloque e Información de Siguiente Turno */}
      <div id="polla-block-selector" className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {/* Bloque Mañana */}
        <button
          onClick={() => {
            setSelectedBlock('MAÑANA');
            setSelectedDate(shiftSchedule.currentShift.block === 'MAÑANA' ? shiftSchedule.currentShift.drawDate : shiftSchedule.nextShift.drawDate);
          }}
          className={`p-4 rounded-2xl border transition-all text-left flex items-center justify-between ${
            selectedBlock === 'MAÑANA'
              ? 'bg-amber-500/10 border-amber-500/60 text-white shadow-lg'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
          }`}
        >
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold text-amber-400 uppercase">TURNO MAÑANA</span>
              {selectedBlock === 'MAÑANA' && <Check className="w-4 h-4 text-amber-400" />}
            </div>
            <div className="text-sm font-black text-neutral-200 mt-0.5">08:00 AM — 01:00 PM</div>
            <span className="text-[10px] text-neutral-400 font-mono block mt-1">Venta abre 02:00 PM • Cierra 07:55 AM</span>
          </div>
          {selectedBlock === 'MAÑANA' && (
            <div className="text-right">
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                salesStatus.isOpen
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}>
                {salesStatus.statusText}
              </span>
              {salesStatus.isOpen && (
                <span className="text-xs font-mono font-bold text-amber-300 block mt-1">
                  ⏱️ {countdownText}
                </span>
              )}
            </div>
          )}
        </button>

        {/* Bloque Tarde */}
        <button
          onClick={() => {
            setSelectedBlock('TARDE');
            setSelectedDate(shiftSchedule.currentShift.block === 'TARDE' ? shiftSchedule.currentShift.drawDate : shiftSchedule.nextShift.drawDate);
          }}
          className={`p-4 rounded-2xl border transition-all text-left flex items-center justify-between ${
            selectedBlock === 'TARDE'
              ? 'bg-amber-500/10 border-amber-500/60 text-white shadow-lg'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
          }`}
        >
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold text-amber-400 uppercase">TURNO TARDE</span>
              {selectedBlock === 'TARDE' && <Check className="w-4 h-4 text-amber-400" />}
            </div>
            <div className="text-sm font-black text-neutral-200 mt-0.5">02:00 PM — 07:00 PM</div>
            <span className="text-[10px] text-neutral-400 font-mono block mt-1">Venta abre 08:05 AM • Cierra 01:55 PM</span>
          </div>
          {selectedBlock === 'TARDE' && (
            <div className="text-right">
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                salesStatus.isOpen
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}>
                {salesStatus.statusText}
              </span>
              {salesStatus.isOpen && (
                <span className="text-xs font-mono font-bold text-amber-300 block mt-1">
                  ⏱️ {countdownText}
                </span>
              )}
            </div>
          )}
        </button>
      </div>

      {/* Alerta / banner de Siguiente Sorteo y Pozo Acumulado */}
      <div className="w-full bg-neutral-900/80 border border-neutral-800 rounded-2xl p-3 mb-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center space-x-2 text-neutral-300">
          <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span><b>Próximo Sorteo Habilitado:</b> {shiftSchedule.nextShift.title}</span>
        </div>
        <div className="flex items-center space-x-3 text-right">
          <span className="text-amber-400 font-bold bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/30">
            🏆 POZO DEL SORTEO ({selectedBlock}): {poolStats.totalTickets} {poolStats.totalTickets === 1 ? 'polla' : 'pollas'} ({poolStats.totalBs.toFixed(2)} Bs)
          </span>
        </div>
      </div>

      {/* Notificaciones de Mensajes y Descarga Inmediata */}
      <AnimatePresence>
        {actionMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`w-full mb-4 p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 text-sm font-bold shadow-lg ${
              actionMessage.isError
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
            }`}
          >
            <div className="flex items-center space-x-3">
              {actionMessage.isError ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
              ) : (
                <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              )}
              <span>{actionMessage.text}</span>
            </div>

            {!actionMessage.isError && lastBoughtTicket && (
              <button
                onClick={() => handleDownloadTicketPng(lastBoughtTicket)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs rounded-xl flex items-center space-x-1.5 shadow-md transition-all flex-shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>DESCARGAR COMPROBANTE PNG</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTENIDO DE PESTAÑA 1: NUEVA POLLA */}
      {activeTab === 'NUEVA_POLLA' && (
        <div className="w-full flex flex-col items-center">
          {/* Barra de Progreso de Selección */}
          <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-4 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-mono font-black text-amber-400 text-lg">
                {selectedAnimalCodes.length}/6
              </div>
              <div>
                <span className="text-xs font-bold text-neutral-300 block uppercase">
                  SELECCIONA EXACTAMENTE 6 ANIMALITOS
                </span>
                <span className="text-[11px] text-neutral-500 font-mono block">
                  Sin repetidos • Límite: 20 pollas por jugador / turno ({myTickets.filter(t => t.block === selectedBlock && t.drawDate === selectedDate).length}/20 jugadas)
                </span>
              </div>
            </div>

            {/* Controles de Selección Rápida */}
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <button
                onClick={handleRandomFill}
                disabled={!salesStatus.isOpen}
                className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center justify-center space-x-1 transition-all disabled:opacity-40"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Azar 6</span>
              </button>
              <button
                onClick={handleClearSelection}
                className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white border border-neutral-700 text-xs font-bold transition-all"
              >
                Limpiar
              </button>
            </div>
          </div>

          {/* Resumen de Selección Actual (Chips) */}
          {selectedAnimalCodes.length > 0 && (
            <div className="w-full bg-neutral-900/90 border border-amber-500/30 rounded-2xl p-3 mb-4 shadow-lg flex flex-wrap gap-2 items-center">
              <span className="text-xs font-bold text-amber-400 font-mono mr-2">TUS ELEGIDOS:</span>
              {selectedAnimalCodes.map((code) => {
                const animal = getAnimalitoByCode(code);
                return (
                  <span
                    key={code}
                    onClick={() => handleToggleAnimal(code)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/50 text-white font-mono text-xs font-bold cursor-pointer hover:bg-rose-500/20 hover:border-rose-500/50 transition-all"
                  >
                    <span>{animal?.icon || '🐾'}</span>
                    <span>{code}</span>
                    <span className="text-amber-300 font-sans">{animal?.name}</span>
                    <span className="text-neutral-400 hover:text-rose-400 ml-1">×</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Catálogo Rejilla de los 77 Animalitos */}
          <div className="w-full grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 gap-2 mb-6">
            {ANIMALITOS_CATALOG.map((item) => {
              const isSelected = selectedAnimalCodes.includes(item.code);
              return (
                <button
                  key={item.code}
                  onClick={() => handleToggleAnimal(item.code)}
                  disabled={!salesStatus.isOpen}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center transition-all relative ${
                    isSelected
                      ? 'bg-gradient-to-br from-amber-500 to-amber-600 border-amber-400 text-neutral-950 scale-105 shadow-lg font-bold'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800'
                  } ${!salesStatus.isOpen ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md mb-0.5 ${
                    isSelected ? 'bg-neutral-950/80 text-amber-400' : 'bg-neutral-800 text-neutral-400'
                  }`}>
                    {item.code}
                  </span>
                  <span className="text-lg sm:text-xl my-0.5">{item.icon}</span>
                  <span className="text-[10px] font-semibold tracking-tighter truncate w-full text-center">
                    {item.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Botón de Confirmación de Compra de Polla */}
          <div className="w-full max-w-md">
            <Button
              onClick={handleBuyPolla}
              disabled={selectedAnimalCodes.length !== 6 || !salesStatus.isOpen || submitting}
              className="w-full py-4 text-base font-black rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-xl transition-all disabled:opacity-40"
            >
              {submitting ? (
                'Procesando Compra...'
              ) : !salesStatus.isOpen ? (
                'VENTA CERRADA PARA ESTE BLOQUE'
              ) : selectedAnimalCodes.length !== 6 ? (
                `SELECCIONA ${6 - selectedAnimalCodes.length} ANIMALITOS MÁS`
              ) : (
                'COMPRAR POLLA — 250.00 Bs'
              )}
            </Button>
            <span className="text-[11px] text-neutral-400 font-mono text-center block mt-2">
              Se descontarán 250.00 Bs automáticamente de tu billetera principal.
            </span>
          </div>
        </div>
      )}

      {/* CONTENIDO DE PESTAÑA 2: MIS POLLAS */}
      {activeTab === 'MIS_POLLAS' && (
        <div className="w-full">
          {loading ? (
            <div className="text-center py-10 text-neutral-400 font-mono">Cargando tus pollas...</div>
          ) : myTickets.length === 0 ? (
            <div className="text-center py-12 bg-neutral-900 border border-neutral-800 rounded-2xl">
              <Ticket className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-neutral-300">No tienes pollas jugadas en este bloque.</p>
              <p className="text-xs text-neutral-500 mt-1">
                Puedes comprar hasta 20 pollas por turno de 250 Bs cada una.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                        {ticket.ticketNumber || `POLLA #${ticket.id.substring(0, 8)}`}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        Turno {ticket.block} • {ticket.drawDate}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ticket.status === 'WINNER'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : ticket.status === 'NOT_WINNER'
                          ? 'bg-neutral-800 text-neutral-400'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      }`}>
                        {ticket.status === 'WINNER' ? '¡GANADORA!' : ticket.status === 'NOT_WINNER' ? 'NO GANADORA' : 'EN JUEGO'}
                      </span>
                    </div>

                    {/* Animales Elegidos */}
                    <div className="flex flex-wrap gap-1.5">
                      {ticket.animalitos.map((code) => {
                        const animal = getAnimalitoByCode(code);
                        return (
                          <span
                            key={code}
                            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-white font-mono text-xs font-bold"
                          >
                            <span>{animal?.icon || '🐾'}</span>
                            <span className="text-amber-400">{code}</span>
                            <span className="text-[10px] text-neutral-400 font-sans">{animal?.name}</span>
                          </span>
                        );
                      })}
                    </div>

                    <div className="text-[10px] font-mono text-neutral-500">
                      Código de Verificación: <span className="text-neutral-300 font-bold">{ticket.verificationCode}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto flex-shrink-0">
                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase font-mono block">MONTO</span>
                      <span className="text-sm font-black text-amber-400 font-mono">250.00 Bs</span>
                    </div>

                    <button
                      onClick={() => handleDownloadTicketPng(ticket)}
                      className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-500/30 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar PNG</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CONTENIDO DE PESTAÑA 3: RESULTADOS */}
      {activeTab === 'RESULTADOS' && (
        <div className="w-full space-y-4">
          {loading ? (
            <div className="text-center py-10 text-neutral-400 font-mono">Cargando resultados de sorteos...</div>
          ) : drawResults.length === 0 ? (
            <div className="text-center py-12 bg-neutral-900 border border-neutral-800 rounded-2xl">
              <ListFilter className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-neutral-300">No hay resultados registrados aún para este bloque.</p>
              <p className="text-xs text-neutral-500 mt-1">
                Los resultados se publican oficialmente al finalizar cada sorteo.
              </p>
            </div>
          ) : (
            drawResults.map((result) => (
              <div key={result.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
                  <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                    SORTEO {result.drawTime} • BLOQUE {result.block}
                  </span>
                  <span className="text-xs font-mono text-neutral-400">{result.drawDate}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {result.lotteries.map((lot, idx) => (
                    <div key={idx} className="bg-neutral-850 p-3 rounded-xl border border-neutral-800">
                      <span className="text-[11px] font-bold text-neutral-300 block mb-2">{lot.lotteryName}</span>
                      <div className="flex flex-wrap gap-1">
                        {lot.numbers.map((code) => {
                          const animal = getAnimalitoByCode(code);
                          return (
                            <span key={code} className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold flex items-center space-x-1">
                              <span>{animal?.icon || '🐾'}</span>
                              <span>{code}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* CONTENIDO DE PESTAÑA 4: GANADORES */}
      {activeTab === 'GANADORES' && (
        <div className="w-full space-y-4">
          {loading ? (
            <div className="text-center py-10 text-neutral-400 font-mono">Cargando ganadores de bloques...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Bloque Mañana Ganador */}
              <div className="bg-neutral-900 border border-amber-500/40 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-mono font-bold text-amber-400 uppercase">PRIMER LUGAR</span>
                    <h3 className="text-sm font-black text-white">GANADOR BLOQUE MAÑANA</h3>
                  </div>
                </div>

                {blockWinners.find((w) => w.block === 'MAÑANA') ? (
                  (() => {
                    const winner = blockWinners.find((w) => w.block === 'MAÑANA')!;
                    return (
                      <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                        <span className="text-[10px] text-neutral-500 uppercase font-mono block">JUGADOR GANADOR</span>
                        <div className="text-lg font-black text-amber-400 uppercase tracking-wide">
                          {winner.winnerName.toUpperCase()}
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs font-mono text-neutral-300">
                          <span>Aciertos: {winner.hits} / 6</span>
                          <span className="font-bold text-emerald-400">{winner.prizeBs.toFixed(2)} Bs</span>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-6 bg-neutral-950 rounded-xl border border-neutral-800/80 text-neutral-500 text-xs font-mono">
                    En proceso de cierre para el Bloque Mañana.
                  </div>
                )}
              </div>

              {/* Bloque Tarde Ganador */}
              <div className="bg-neutral-900 border border-amber-500/40 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-mono font-bold text-amber-400 uppercase">SEGUNDO LUGAR</span>
                    <h3 className="text-sm font-black text-white">GANADOR BLOQUE TARDE</h3>
                  </div>
                </div>

                {blockWinners.find((w) => w.block === 'TARDE') ? (
                  (() => {
                    const winner = blockWinners.find((w) => w.block === 'TARDE')!;
                    return (
                      <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                        <span className="text-[10px] text-neutral-500 uppercase font-mono block">JUGADOR GANADOR</span>
                        <div className="text-lg font-black text-amber-400 uppercase tracking-wide">
                          {winner.winnerName.toUpperCase()}
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs font-mono text-neutral-300">
                          <span>Aciertos: {winner.hits} / 6</span>
                          <span className="font-bold text-emerald-400">{winner.prizeBs.toFixed(2)} Bs</span>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-6 bg-neutral-950 rounded-xl border border-neutral-800/80 text-neutral-500 text-xs font-mono">
                    En proceso de cierre para el Bloque Tarde.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
