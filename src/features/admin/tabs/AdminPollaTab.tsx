// ==============================================================================
// RASPANDO LA OLLA — TAB ADMINISTRATIVO: POLLA VENEZOLANA
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { PollaRepository } from '../../../services/repositories/PollaRepository';
import { ANIMALITOS_CATALOG, getAnimalitoByCode } from '../../../data/pollaAnimalitos';
import type { PollaBlockType, PollaDrawResultItem, PollaBlockWinner, PollaTicket } from '../../../types/games';
import { Trophy, Save, ListFilter, CheckCircle, AlertCircle, RefreshCw, ShieldCheck, DollarSign, Check, X } from 'lucide-react';

export const AdminPollaTab: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(PollaRepository.getTodayVenezuelaString());
  const [selectedBlock, setSelectedBlock] = useState<PollaBlockType>('MAÑANA');
  const [selectedDrawTime, setSelectedDrawTime] = useState<string>('08:00');

  // Loterías (4 loterías x 3 números)
  const [lottery1, setLottery1] = useState<string[]>(['00', '01', '02']);
  const [lottery2, setLottery2] = useState<string[]>(['10', '11', '12']);
  const [lottery3, setLottery3] = useState<string[]>(['20', '21', '22']);
  const [lottery4, setLottery4] = useState<string[]>(['30', '31', '32']);

  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [results, setResults] = useState<PollaDrawResultItem[]>([]);
  const [winners, setWinners] = useState<PollaBlockWinner[]>([]);
  const [pendingTickets, setPendingTickets] = useState<(PollaTicket & { userName?: string })[]>([]);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Estados de entrada para premios por ticket
  const [customPrizes, setCustomPrizes] = useState<Record<string, number>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const drawTimesByBlock = selectedBlock === 'MAÑANA'
    ? ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00']
    : ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

  const loadData = async () => {
    setLoading(true);
    try {
      const [resData, winData, ticketsData] = await Promise.all([
        PollaRepository.getDrawResults(selectedDate, selectedBlock),
        PollaRepository.getBlockWinners(selectedDate),
        PollaRepository.getPendingValidationTickets(selectedDate),
      ]);
      setResults(resData);
      setWinners(winData);
      setPendingTickets(ticketsData);
    } catch (err) {
      console.error('[AdminPollaTab] Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate, selectedBlock]);

  const handleSaveResult = async () => {
    setSubmitting(true);
    setMessage(null);

    const lotteries = [
      { lotteryName: 'Lotería 1 (Lotto Activo)', numbers: lottery1 },
      { lotteryName: 'Lotería 2 (La Granjita)', numbers: lottery2 },
      { lotteryName: 'Lotería 3 (Guácharo Activo)', numbers: lottery3 },
      { lotteryName: 'Lotería 4 (Selva Plus)', numbers: lottery4 },
    ];

    const res = await PollaRepository.saveDrawResult(selectedDate, selectedBlock, selectedDrawTime, lotteries);
    if (res.success) {
      // Detección automática de aciertos tras guardar
      const detectRes = await PollaRepository.detectPotentialWinners(selectedDate, selectedBlock);
      setSubmitting(false);
      setMessage({ 
        text: `Resultado publicado! ${detectRes.message || ''}`, 
        isError: false 
      });
      await loadData();
    } else {
      setSubmitting(false);
      setMessage({ text: res.error || 'Error registrando resultado.', isError: true });
    }
  };

  const handleDetectWinnersManually = async () => {
    setSubmitting(true);
    setMessage(null);
    const res = await PollaRepository.detectPotentialWinners(selectedDate, selectedBlock);
    setSubmitting(false);
    if (res.success) {
      setMessage({ text: res.message || 'Detección finalizada.', isError: false });
      await loadData();
    } else {
      setMessage({ text: res.error || 'Error detectando ganadores.', isError: true });
    }
  };

  const handleValidateTicket = async (ticketId: string, action: 'VALIDATE' | 'REJECT') => {
    setSubmitting(true);
    setMessage(null);
    const reason = rejectionReasons[ticketId] || 'Revisado por administrador';
    const res = await PollaRepository.validateWinner(ticketId, action, reason);
    setSubmitting(false);
    if (res.success) {
      setMessage({ text: res.message || 'Estado actualizado.', isError: false });
      await loadData();
    } else {
      setMessage({ text: res.error || 'Error al validar ticket.', isError: true });
    }
  };

  const handleCreditPrize = async (ticketId: string) => {
    const amount = customPrizes[ticketId] || 1000;
    if (amount <= 0) {
      setMessage({ text: 'Ingresa un monto de premio válido mayor a 0.', isError: true });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const res = await PollaRepository.creditPrize(ticketId, amount);
    setSubmitting(false);
    if (res.success) {
      setMessage({ text: res.message || 'Premio acreditado exitosamente.', isError: false });
      await loadData();
    } else {
      setMessage({ text: res.error || 'Error acreditando premio.', isError: true });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
        <h2 className="text-xl font-black text-white uppercase tracking-tight mb-1 flex items-center space-x-2">
          <span>GESTIÓN DE POLLA VENEZOLANA</span>
        </h2>
        <p className="text-xs text-neutral-400 font-mono">
          Publicación de Resultados Oficiales, Detección de Aciertos y Validación Humana de Premios.
        </p>

        {/* Filtros de Fecha y Bloque */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">FECHA DE SORTEO</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">BLOQUE</label>
            <select
              value={selectedBlock}
              onChange={(e) => {
                const b = e.target.value as PollaBlockType;
                setSelectedBlock(b);
                setSelectedDrawTime(b === 'MAÑANA' ? '08:00' : '14:00');
              }}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
            >
              <option value="MAÑANA">BLOQUE MAÑANA (08:00 - 13:00)</option>
              <option value="TARDE">BLOQUE TARDE (14:00 - 19:00)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">HORA DEL SORTEO</label>
            <select
              value={selectedDrawTime}
              onChange={(e) => setSelectedDrawTime(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
            >
              {drawTimesByBlock.map((time) => (
                <option key={time} value={time}>{time} HORS</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Formulario de Carga de Resultado */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider">
          REGISTRAR RESULTADO OFICIAL — {selectedDrawTime} ({selectedBlock})
        </h3>

        {message && (
          <div className={`p-3 rounded-xl border text-xs font-bold ${
            message.isError ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Lotería 1 */}
          <div className="bg-neutral-800/60 p-3 rounded-2xl border border-neutral-700">
            <span className="text-xs font-bold text-white block mb-2">Lotería 1 (Lotto Activo)</span>
            <div className="space-y-1.5">
              {[0, 1, 2].map((idx) => (
                <input
                  key={idx}
                  type="text"
                  maxLength={2}
                  placeholder={`Cod ${idx + 1} (ej. 00)`}
                  value={lottery1[idx] || ''}
                  onChange={(e) => {
                    const arr = [...lottery1];
                    arr[idx] = e.target.value;
                    setLottery1(arr);
                  }}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-mono text-center font-bold"
                />
              ))}
            </div>
          </div>

          {/* Lotería 2 */}
          <div className="bg-neutral-800/60 p-3 rounded-2xl border border-neutral-700">
            <span className="text-xs font-bold text-white block mb-2">Lotería 2 (La Granjita)</span>
            <div className="space-y-1.5">
              {[0, 1, 2].map((idx) => (
                <input
                  key={idx}
                  type="text"
                  maxLength={2}
                  placeholder={`Cod ${idx + 1} (ej. 05)`}
                  value={lottery2[idx] || ''}
                  onChange={(e) => {
                    const arr = [...lottery2];
                    arr[idx] = e.target.value;
                    setLottery2(arr);
                  }}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-mono text-center font-bold"
                />
              ))}
            </div>
          </div>

          {/* Lotería 3 */}
          <div className="bg-neutral-800/60 p-3 rounded-2xl border border-neutral-700">
            <span className="text-xs font-bold text-white block mb-2">Lotería 3 (Guácharo)</span>
            <div className="space-y-1.5">
              {[0, 1, 2].map((idx) => (
                <input
                  key={idx}
                  type="text"
                  maxLength={2}
                  placeholder={`Cod ${idx + 1} (ej. 12)`}
                  value={lottery3[idx] || ''}
                  onChange={(e) => {
                    const arr = [...lottery3];
                    arr[idx] = e.target.value;
                    setLottery3(arr);
                  }}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-mono text-center font-bold"
                />
              ))}
            </div>
          </div>

          {/* Lotería 4 */}
          <div className="bg-neutral-800/60 p-3 rounded-2xl border border-neutral-700">
            <span className="text-xs font-bold text-white block mb-2">Lotería 4 (Selva Plus)</span>
            <div className="space-y-1.5">
              {[0, 1, 2].map((idx) => (
                <input
                  key={idx}
                  type="text"
                  maxLength={2}
                  placeholder={`Cod ${idx + 1} (ej. 25)`}
                  value={lottery4[idx] || ''}
                  onChange={(e) => {
                    const arr = [...lottery4];
                    arr[idx] = e.target.value;
                    setLottery4(arr);
                  }}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-mono text-center font-bold"
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleSaveResult}
            disabled={submitting}
            className="py-3 px-6 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-sm rounded-xl flex items-center space-x-2 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{submitting ? 'Guardando...' : 'Publicar Resultado del Sorteo'}</span>
          </button>

          <button
            onClick={handleDetectWinnersManually}
            disabled={submitting}
            className="py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-500/30 font-bold text-xs rounded-xl flex items-center space-x-2 transition-all disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Auditar & Escanear Aciertos</span>
          </button>
        </div>
      </div>

      {/* PANEL DE VALIDACIÓN HUMANA Y ACREDITACIÓN DE PREMIOS */}
      <div className="bg-neutral-900 border border-amber-500/30 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <span>REVISIÓN HUMANA Y ACREDITACIÓN DE PREMIOS</span>
            </h3>
            <p className="text-xs text-neutral-400 font-mono mt-0.5">
              Ningún premio se acredita automáticamente. Requiere aprobación explícita de un administrador.
            </p>
          </div>
          <button
            onClick={loadData}
            className="p-2 rounded-xl bg-neutral-800 text-amber-400 hover:bg-neutral-700 transition-all"
            title="Recargar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {pendingTickets.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 font-mono text-xs bg-neutral-950 rounded-2xl border border-neutral-800">
            No hay tickets de polla registrados para esta fecha.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingTickets.map((ticket) => {
              const valStatus = ticket.validationStatus || 'PENDING';
              return (
                <div
                  key={ticket.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 shadow-lg space-y-3"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-neutral-850 pb-2">
                    <div>
                      <span className="text-xs font-mono font-bold text-amber-400 mr-2">
                        {ticket.ticketNumber}
                      </span>
                      <span className="text-xs font-bold text-white uppercase mr-2">
                        {ticket.userName}
                      </span>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        Turno {ticket.block} • {ticket.drawDate}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-bold text-neutral-300 bg-neutral-800 px-2.5 py-1 rounded-lg">
                        {ticket.hits} Aciertos
                      </span>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                        valStatus === 'CREDITED'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : valStatus === 'VALIDATED'
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                          : valStatus === 'PENDING_VALIDATION'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : valStatus === 'REJECTED'
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}>
                        {valStatus === 'CREDITED'
                          ? '✔ PAGADO / ACREDITADO'
                          : valStatus === 'VALIDATED'
                          ? 'Aprobado (Listo para Pagar)'
                          : valStatus === 'PENDING_VALIDATION'
                          ? 'Requiere Revisión'
                          : valStatus === 'REJECTED'
                          ? 'Rechazado'
                          : 'Pendiente'}
                      </span>
                    </div>
                  </div>

                  {/* Animalitos Jugados */}
                  <div className="flex flex-wrap gap-1.5">
                    {ticket.animalitos.map((code) => {
                      const animal = getAnimalitoByCode(code);
                      return (
                        <span
                          key={code}
                          className="px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-white font-mono text-xs font-bold flex items-center space-x-1"
                        >
                          <span>{animal?.icon || '🐾'}</span>
                          <span className="text-amber-400">{code}</span>
                        </span>
                      );
                    })}
                  </div>

                  {/* Acciones de Administrador */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-neutral-850">
                    <div className="w-full sm:w-auto flex items-center space-x-2">
                      {valStatus !== 'CREDITED' && valStatus !== 'REJECTED' && (
                        <>
                          <button
                            onClick={() => handleValidateTicket(ticket.id, 'VALIDATE')}
                            disabled={submitting}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1 transition-all"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Aprobar Ticket</span>
                          </button>

                          <button
                            onClick={() => handleValidateTicket(ticket.id, 'REJECT')}
                            disabled={submitting}
                            className="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center space-x-1 transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Rechazar</span>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Formulario de Acreditación de Premio */}
                    {valStatus === 'VALIDATED' && (
                      <div className="w-full sm:w-auto flex items-center space-x-2">
                        <div className="relative">
                          <input
                            type="number"
                            placeholder="Monto Premio Bs"
                            value={customPrizes[ticket.id] || ''}
                            onChange={(e) =>
                              setCustomPrizes({
                                ...customPrizes,
                                [ticket.id]: Number(e.target.value),
                              })
                            }
                            className="w-32 bg-neutral-900 border border-emerald-500/40 rounded-xl px-2.5 py-1.5 text-xs text-emerald-400 font-mono font-bold"
                          />
                          <span className="absolute right-2 top-1.5 text-[10px] text-neutral-500 font-mono">Bs</span>
                        </div>

                        <button
                          onClick={() => handleCreditPrize(ticket.id)}
                          disabled={submitting}
                          className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs rounded-xl flex items-center space-x-1 transition-all shadow-lg"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Pagar a Billetera</span>
                        </button>
                      </div>
                    )}

                    {valStatus === 'CREDITED' && (
                      <div className="text-xs font-mono font-bold text-emerald-400 flex items-center space-x-1">
                        <CheckCircle className="w-4 h-4" />
                        <span>Acreditado: {ticket.prizeBs.toFixed(2)} Bs</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

