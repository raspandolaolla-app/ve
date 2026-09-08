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
  isSuccess?: boolean;
  settlementError?: string | null;
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
  const lastParamsRef = useRef<{
    winnerUserId: string | null;
    isDraw: boolean;
    winnerTeamIndex?: number | null;
  } | null>(null);

  const handleSettleGame = useCallback(
    async (winnerUserId: string | null, isDraw: boolean, winnerTeamIndex?: number | null) => {
      if (!session?.id || isSettledRef.current) return;
      isSettledRef.current = true;
      setIsSettling(true);
      lastParamsRef.current = { winnerUserId, isDraw, winnerTeamIndex };

      const grossPool = table.entryFee * (currentPlayers.length || 2);
      const poolBreakdown = FinancialRepository.calculatePoolBreakdown(grossPool);

      try {
        if (isDraw || !winnerUserId) {
          // Empate oficial -> Reembolso íntegro
          const idempotencyKey = `refund_${session.id}`;
          const refundResult = await GameRepository.refundSession(
            session.id,
            'Empate oficial en partida',
            idempotencyKey
          );

          if (!refundResult.success) {
            console.error('[GameSettlement] Error en reembolso por empate:', refundResult.error);
            setSettlementResult({
              grossPool,
              prizePool: 0,
              platformFee: 0,
              winnerName: 'Empate Técnico',
              isWinner: false,
              isDraw: true,
              isSuccess: false,
              settlementError: refundResult.error || 'No fue posible completar el reembolso automático de inmediato. Tu saldo permanece protegido.',
            });
            return;
          }

          setSettlementResult({
            grossPool,
            prizePool: 0,
            platformFee: 0,
            winnerName: 'Empate Técnico',
            isWinner: false,
            isDraw: true,
            isSuccess: true,
            settlementError: null,
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

          if (!settlement.success) {
            console.error('[GameSettlement] Error en liquidación autoritativa universal:', settlement.error);
            setSettlementResult({
              grossPool: settlement.grossPool || grossPool,
              prizePool: settlement.prizePool ?? poolBreakdown.prizePool,
              platformFee: settlement.platformFee ?? poolBreakdown.platformFee,
              winnerName,
              isWinner: winnerUserId === currentUserId,
              isDraw: false,
              isSuccess: false,
              settlementError: settlement.error || 'No fue posible completar la liquidación de inmediato. Tu saldo permanece protegido.',
            });
            return;
          }

          setSettlementResult({
            grossPool: settlement.grossPool || grossPool,
            prizePool: settlement.prizePool ?? poolBreakdown.prizePool,
            platformFee: settlement.platformFee ?? poolBreakdown.platformFee,
            winnerName,
            isWinner: winnerUserId === currentUserId,
            isDraw: false,
            isSuccess: true,
            settlementError: null,
          });

          if (winnerUserId === currentUserId && onWinNotice) {
            const winPct = settlement.winnerPercentage || 90;
            onWinNotice(`🏆 ¡Victoria declarada! Premio acreditado (${winPct}% del pozo).`);
          }
        }
      } catch (err: unknown) {
        console.error('[GameSettlement] Error de red o ejecución en liquidación:', err);
        const winnerPlayer = currentPlayers.find((p) => p.userId === winnerUserId);
        const winnerName = isDraw
          ? 'Empate Técnico'
          : winnerUserId === currentUserId
          ? '¡Tú obtuviste la victoria!'
          : winnerPlayer?.displayName || 'Ganador';

        setSettlementResult({
          grossPool,
          prizePool: isDraw ? 0 : poolBreakdown.prizePool,
          platformFee: isDraw ? 0 : poolBreakdown.platformFee,
          winnerName,
          isWinner: !isDraw && winnerUserId === currentUserId,
          isDraw,
          isSuccess: false,
          settlementError: 'No fue posible completar la liquidación de inmediato. Tu saldo permanece protegido.',
        });
      } finally {
        setIsSettling(false);
      }
    },
    [session?.id, table.entryFee, currentPlayers, currentUserId, onWinNotice]
  );

  const retrySettlement = useCallback(async () => {
    if (!lastParamsRef.current) return;
    isSettledRef.current = false;
    await handleSettleGame(
      lastParamsRef.current.winnerUserId,
      lastParamsRef.current.isDraw,
      lastParamsRef.current.winnerTeamIndex
    );
  }, [handleSettleGame]);

  return {
    isSettling,
    setIsSettling,
    settlementResult,
    setSettlementResult,
    isSettledRef,
    handleSettleGame,
    retrySettlement,
  };
}
