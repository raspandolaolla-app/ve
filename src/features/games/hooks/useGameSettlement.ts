import { useState, useRef, useCallback } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import type { GameSession } from '../../../types/games';
import { GameRepository } from '../../../services/repositories/GameRepository';
import { FinancialRepository } from '../../../services/repositories/FinancialRepository';

export interface SettlementResult {
  grossPool: number;
  prizePool: number;
  platformFee: number;
  winnerName: string;
  isWinner: boolean;
  isDraw?: boolean;
}

interface UseGameSettlementParams {
  table: GameTable;
  session: GameSession | null;
  currentPlayers: TablePlayer[];
  currentUserId: string;
  onWinNotice?: (notice: string) => void;
}

export function useGameSettlement({
  table,
  session,
  currentPlayers,
  currentUserId,
  onWinNotice,
}: UseGameSettlementParams) {
  const [isSettling, setIsSettling] = useState(false);
  const [settlementResult, setSettlementResult] = useState<SettlementResult | null>(null);
  const isSettledRef = useRef(false);

  const handleSettleGame = useCallback(
    async (winnerUserId: string | null, isDraw: boolean, winnerTeamIndex?: number | null) => {
      if (!session?.id || isSettledRef.current) return;
      isSettledRef.current = true;
      setIsSettling(true);

      const grossPool = table.entryFee * (currentPlayers.length || 2);

      try {
        if (isDraw || !winnerUserId) {
          // Empate oficial -> Reembolso íntegro
          const idempotencyKey = `refund_${session.id}`;
          await GameRepository.refundSession(
            session.id,
            'Empate oficial en partida',
            idempotencyKey
          );

          setSettlementResult({
            grossPool,
            prizePool: 0,
            platformFee: 0,
            winnerName: 'Empate Técnico',
            isWinner: false,
            isDraw: true,
          });
        } else {
          // Victoria oficial -> Liquidación con RPC Universal
          const idempotencyKey = `settle_${session.id}_${winnerUserId}`;
          const settlement = await GameRepository.settleSession(
            session.id,
            [winnerUserId],
            typeof winnerTeamIndex === 'number' ? winnerTeamIndex : null,
            idempotencyKey
          );

          const winnerPlayer = currentPlayers.find((p) => p.userId === winnerUserId);
          const winnerName =
            winnerUserId === currentUserId
              ? '¡Tú obtuviste la victoria!'
              : winnerPlayer?.displayName || 'Ganador';
          const poolBreakdown = FinancialRepository.calculatePoolBreakdown(grossPool);

          setSettlementResult({
            grossPool: settlement.grossPool || grossPool,
            prizePool: settlement.prizePool ?? poolBreakdown.prizePool,
            platformFee: settlement.platformFee ?? poolBreakdown.platformFee,
            winnerName,
            isWinner: winnerUserId === currentUserId,
            isDraw: false,
          });

          if (winnerUserId === currentUserId && onWinNotice) {
            const winPct = settlement.winnerPercentage || 90;
            onWinNotice(`🏆 ¡Victoria declarada! Premio acreditado (${winPct}% del pozo).`);
          }
        }
      } catch (err: unknown) {
        console.error('[GameSettlement] Error en liquidación autoritativa universal:', err);
      } finally {
        setIsSettling(false);
      }
    },
    [session?.id, table.entryFee, currentPlayers, currentUserId, onWinNotice]
  );

  return {
    isSettling,
    setIsSettling,
    settlementResult,
    setSettlementResult,
    isSettledRef,
    handleSettleGame,
  };
}
