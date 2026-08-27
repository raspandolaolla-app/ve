// ==============================================================================
// RASPANDO LA OLLA — TAB ADMINISTRATIVO: POLLA VENEZOLANA
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { PollaRepository } from '../../../services/repositories/PollaRepository';
import { ANIMALITOS_CATALOG, getAnimalitoByCode } from '../../../data/pollaAnimalitos';
import type { PollaBlockType, PollaDrawResultItem, PollaBlockWinner } from '../../../types/games';
import { Trophy, Save, ListFilter, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

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
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const drawTimesByBlock = selectedBlock === 'MAÑANA'
    ? ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00']
    : ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

  const loadData = async () => {
    setLoading(true);
    try {
      const [resData, winData] = await Promise.all([
        PollaRepository.getDrawResults(selectedDate, selectedBlock),
        PollaRepository.getBlockWinners(selectedDate),
      ]);
      setResults(resData);
      setWinners(winData);
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
    setSubmitting(false);

    if (res.success) {
      setMessage({ text: `Resultado registrado para el Sorteo ${selectedDrawTime}!`, isError: false });
      await loadData();
    } else {
      setMessage({ text: res.error || 'Error registrando resultado.', isError: true });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
        <h2 className="text-xl font-black text-white uppercase tracking-tight mb-1 flex items-center space-x-2">
          <span>GESTIÓN DE POLLA VENEZOLANA</span>
        </h2>
        <p className="text-xs text-neutral-400 font-mono">
          Publicación de Resultados Oficiales de Sorteos por Lotería y Auditoría de Cierres de Bloque.
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

        <button
          onClick={handleSaveResult}
          disabled={submitting}
          className="py-3 px-6 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-sm rounded-xl flex items-center space-x-2 transition-all"
        >
          <Save className="w-4 h-4" />
          <span>{submitting ? 'Guardando...' : 'Publicar Resultado del Sorteo'}</span>
        </button>
      </div>
    </div>
  );
};
