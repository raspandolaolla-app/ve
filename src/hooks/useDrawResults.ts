// ==============================================================================
// RASPANDO LA OLLA — HOOK PARA ESCUCHAR RESULTADOS DE SORTEOS EN TIEMPO REAL
// ==============================================================================

import { useEffect } from 'react';
import { RealtimeManager } from '../services/realtime/RealtimeManager';

export interface DrawResult {
  id: string;
  draw_type: 'BINGO' | 'POLLA';
  draw_date: string;
  draw_time?: string;
  block?: 'MAÑANA' | 'TARDE';
  lottery_name?: string;
  result_numbers?: number[] | string[];
  winner_user_id?: string;
  prize_amount_bs?: number;
}

export function useDrawResults(
  onNewResult?: (result: DrawResult) => void
) {
  useEffect(() => {
    const unsubscribe = RealtimeManager.subscribeToDrawResults((result) => {
      console.log('[useDrawResults] Nuevo resultado recibido:', result);
      
      if (onNewResult) {
        onNewResult(result as DrawResult);
      }

      if (result.draw_type === 'POLLA') {
        const numbers = Array.isArray(result.result_numbers) 
          ? result.result_numbers.slice(0, 5).join(', ')
          : '';
        console.log(`🎰 Nuevo sorteo de ${result.lottery_name || 'Polla'}: ${numbers}`);
      } else if (result.draw_type === 'BINGO') {
        const ball = Array.isArray(result.result_numbers) && result.result_numbers.length > 0
          ? result.result_numbers[result.result_numbers.length - 1]
          : null;
        if (ball) {
          console.log(`🎱 Nueva balota de Bingo: ${ball}`);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onNewResult]);
}
