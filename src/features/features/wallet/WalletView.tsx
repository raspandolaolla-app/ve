// ==============================================================================
// RASPANDO LA OLLA — VISTA DE BILLETERA Y LEDGER (INTEGRACIÓN COMPLETA FASE 4)
// ==============================================================================
// Interfaz interactiva conectada a Supabase:
// - Consulta de saldo disponible, retenido y total desde tabla `wallets`
// - Historial contable auditado desde `ledger_entries`
// - Solicitud de recarga de saldo mediante `deposit_requests`
// - Solicitud de retiro pesimista mediante `request_withdrawal_locked` RPC
// - Registro de cuentas de Pago Móvil en `payment_accounts`
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import type React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { WalletRepository } from '../../services/repositories/WalletRepository';
import { PaymentRepository } from '../../services/repositories/PaymentRepository';
import { RealtimeManager } from '../../services/realtime/RealtimeManager';
import type { WalletBalance, WalletTransaction } from '../../types/wallet';
import type { PaymentAccount } from '../../types/payments';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { ClaimTestBonusModal } from './components/ClaimTestBonusModal';
import { formatBolivares, maskPhone, maskCedula } from '../../utils/formatters';
import { FINANCIAL_RULES } from '../../utils/constants';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
import { useBcvRate } from '../../context/BcvContext';
import { CloudflareCaptcha } from '../../components/common/CloudflareCaptcha';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  ShieldCheck,
  Clock,
  Lock,
  PlusCircle,
  X,
  CheckCircle2,
  AlertCircle,
  Building,
  RefreshCw,
  Loader2,
  Upload,
} from 'lucide-react';
import { useWallet } from '../../context/WalletContext';

export function WalletView() {
  const { state, user, profile, role, isSigningIn, openLoginModal } = useAuth();
  const { activeWalletModal, closeWalletModals } = useWallet();
  const { rateInfo, refreshRate, formatUsd } = useBcvRate();
  const isAdminOrOperator = role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'OPERATOR';
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal de Recarga
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number>(50);
  const [depositOriginBank, setDepositOriginBank] = useState<string>('0102 - Banco de Venezuela');
  const [depositReference, setDepositReference] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [depositFeedback, setDepositFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Modal de Retiro
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  useEffect(() => {
    if (activeWalletModal === 'deposit') {
      setShowDepositModal(true);
    } else if (activeWalletModal === 'withdraw') {
      setShowWithdrawModal(true);
    }
  }, [activeWalletModal]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [withdrawAmount, setWithdrawAmount] = useState<number>(50);
  const [withdrawTotpCode, setWithdrawTotpCode] = useState<string>('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);
  const [withdrawFeedback, setWithdrawFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Modal de Agregar Cuenta Pago Móvil
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [newBankCode, setNewBankCode] = useState('0102');
  const [newBankName, setNewBankName] = useState('Banco de Venezuela');
  const [newPhone, setNewPhone] = useState('');
  const [newIdDoc, setNewIdDoc] = useState('');
  const [newHolderName, setNewHolderName] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountFeedback, setAccountFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const isAuthenticated = state === 'authenticated' && user !== null;

  const loadWalletData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [b, txs, accounts] = await Promise.all([
        WalletRepository.getBalance(user.id),
        WalletRepository.getTransactions(user.id, 25),
        PaymentRepository.getPaymentAccounts(user.id),
      ]);
      setBalance(b);
      setTransactions(txs);
      setPaymentAccounts(accounts);
      if (accounts.length > 0) {
        setSelectedAccountId((prev) => prev || accounts[0].id);
      }
    } catch (err) {
      console.error('Error cargando billetera:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setBalance(null);
      setTransactions([]);
      setPaymentAccounts([]);
      return;
    }

    loadWalletData();

    // Suscripción en tiempo real a saldo y eventos (idempotente y protegida)
    const unsubscribeUserEvents = RealtimeManager.subscribeToUserEvents(
      user.id,
      () => {
        loadWalletData();
      },
      () => {
        loadWalletData();
      }
    );

    return () => {
      unsubscribeUserEvents();
    };
  }, [isAuthenticated, user?.id, loadWalletData]);

  // Manejar solicitud de recarga
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositReference.trim() || depositAmount <= 0) return;

    setSubmittingDeposit(true);
    setDepositFeedback(null);

    try {
      let uploadedReceiptUrl: string | undefined = undefined;

      if (receiptFile) {
        const uploadRes = await PaymentRepository.uploadReceiptImage(receiptFile);
        if (!uploadRes.success) {
          setDepositFeedback({
            success: false,
            message: uploadRes.error || 'Error al subir la imagen del comprobante.',
          });
          setSubmittingDeposit(false);
          return;
        }
        uploadedReceiptUrl = uploadRes.publicUrl;
      }

      const res = await PaymentRepository.submitDepositRequest({
        amount: Number(depositAmount),
        bankOrigin: depositOriginBank,
        referenceNumber: depositReference.trim(),
        receiptUrl: uploadedReceiptUrl,
      });

      if (res.success) {
        setDepositFeedback({
          success: true,
          message: 'Solicitud de recarga enviada con éxito. El operador revisará el comprobante.',
        });
        setDepositReference('');
        setReceiptFile(null);
        setReceiptPreview(null);
        loadWalletData();
      } else {
        setDepositFeedback({
          success: false,
          message: sanitizeUserErrorMessage(res.error, 'No fue posible registrar la recarga. Inténtalo nuevamente.'),
        });
      }
    } catch (err: any) {
      setDepositFeedback({
        success: false,
        message: sanitizeUserErrorMessage(err, 'Error al procesar la recarga. Tu saldo no ha sido modificado.'),
      });
    } finally {
      setSubmittingDeposit(false);
    }
  };

  // Manejar solicitud de retiro
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || withdrawAmount <= 0 || !user) return;

    if (!captchaToken) {
      setWithdrawFeedback({
        success: false,
        message: 'Por favor, completa la verificación humana antes de solicitar el retiro.',
      });
      return;
    }

    if (balance && withdrawAmount > balance.availableBalance) {
      setWithdrawFeedback({
        success: false,
        message: 'El monto solicitado excede tu saldo disponible.',
      });
      return;
    }

    setSubmittingWithdraw(true);
    setWithdrawFeedback(null);

    try {
      // 1. Verificar el token de Turnstile en el backend (/api/verify-captcha)
      const verifyResponse = await fetch('/api/verify-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: captchaToken }),
      });

      const verifyData = await verifyResponse.json();
      if (!verifyData.success) {
        setWithdrawFeedback({
          success: false,
          message: 'Verificación de seguridad fallida. Por favor intenta de nuevo.',
        });
        setCaptchaToken(null);
        setSubmittingWithdraw(false);
        return;
      }

      // 2. Si es humano verificado, procesar el retiro protegido
      const idempotencyKey = `wth_${user.id}_${Date.now()}`;
      const res = await WalletRepository.requestWithdrawal(
        selectedAccountId,
        Number(withdrawAmount),
        idempotencyKey,
        withdrawTotpCode
      );

      if (res.success) {
        setWithdrawFeedback({
          success: true,
          message: 'Retiro solicitado con éxito. El saldo fue retenido en el ledger contable.',
        });
        loadWalletData();
        setCaptchaToken(null);
      } else {
        setWithdrawFeedback({
          success: false,
          message: sanitizeUserErrorMessage(res.error, 'No se pudo procesar el retiro. Tu saldo no ha sido modificado.'),
        });
        setCaptchaToken(null);
      }
    } catch (err: any) {
      setWithdrawFeedback({
        success: false,
        message: sanitizeUserErrorMessage(err, 'No fue posible completar la solicitud de retiro.'),
      });
      setCaptchaToken(null);
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  // Crear cuenta de Pago Móvil
  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim() || !newIdDoc.trim() || !newHolderName.trim()) return;

    setCreatingAccount(true);
    setAccountFeedback(null);

    try {
      const acc = await PaymentRepository.createPaymentAccount({
        bankCode: newBankCode,
        bankName: newBankName,
        phoneNumber: newPhone.trim(),
        idDocument: newIdDoc.trim(),
        accountHolderName: newHolderName.trim(),
      });

      if (acc) {
        setAccountFeedback({
          success: true,
          message: 'Cuenta de Pago Móvil registrada exitosamente.',
        });
        setShowAccountModal(false);
        loadWalletData();
      } else {
        setAccountFeedback({
          success: false,
          message: 'Error al registrar la cuenta bancaria. Verifica los datos.',
        });
      }
    } catch (err: any) {
      setAccountFeedback({
        success: false,
        message: sanitizeUserErrorMessage(err, 'No fue posible guardar la cuenta bancaria.'),
      });
    } finally {
      setCreatingAccount(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div id="wallet-unauthenticated" className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-amber-400">
          <Wallet className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">Billetera Digital</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Inicia sesión para consultar tu saldo en Bolívares (Bs.), recargar fondos o solicitar retiros de tus premios.
        </p>
        <Button
          id="wallet-signin-btn"
          variant="primary"
          onClick={openLoginModal}
          disabled={isSigningIn}
          leftIcon={isSigningIn ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : undefined}
          className="w-full font-black text-sm uppercase tracking-wider bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 hover:from-yellow-300 hover:to-yellow-200 text-slate-950 shadow-lg shadow-yellow-500/30"
        >
          {isSigningIn ? 'Conectando...' : 'INGRESAR'}
        </Button>
      </div>
    );
  }

  return (
    <div id="wallet-view" className="space-y-8 max-w-5xl mx-auto">
      {/* Encabezado y Regla 90/10 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-black text-slate-100">Mi Billetera</h1>
            <button
              onClick={loadWalletData}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors ml-2"
              title="Refrescar saldo"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gestión segura de saldo y movimientos en Bolívares ({FINANCIAL_RULES.CURRENCY_SYMBOL}).
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
          <Scale className="w-4 h-4 text-amber-400" />
          <span>Regla de Liquidación: <strong>{FINANCIAL_RULES.WINNER_PERCENT}% Ganador</strong> / {FINANCIAL_RULES.SERVICE_FEE_PERCENT}% Comisión</span>
        </div>
      </div>

      {/* Banner Informativo Tasa Oficial BCV */}
      <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md">
        <div className="flex items-center gap-2 text-slate-200">
          <span className={`w-2.5 h-2.5 rounded-full ${rateInfo.status === 'UPDATED' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
          <span className="font-semibold">Tasa Oficial BCV:</span>
          <span className="font-mono font-bold text-amber-400 text-sm">
            1 USD = {rateInfo.rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
          <span>Actualización: <strong className="text-slate-300 font-mono">{rateInfo.formattedTimestamp}</strong></span>
          <span className="text-slate-500">• {rateInfo.source}</span>
          <button
            onClick={() => refreshRate()}
            className="text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 font-semibold cursor-pointer ml-auto sm:ml-0"
            title="Actualizar tasa BCV"
          >
            <RefreshCw className="w-3 h-3" />
            Actualizar
          </button>
        </div>
      </div>

      {rateInfo.errorMessage && (
        <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{rateInfo.errorMessage}</span>
        </div>
      )}

      {/* Banner / Modal para Reclamar Bono de Prueba de 5000 Bs */}
      <ClaimTestBonusModal
        hasClaimed={profile?.hasClaimedTestBonus}
        onSuccess={loadWalletData}
      />

      {/* Tarjetas de Saldo Real con Conversión Informativa USD */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card id="card-available-balance" className="border-amber-500/30 bg-gradient-to-b from-amber-950/20 to-slate-900">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Saldo Disponible
          </span>
          <div className="text-2xl sm:text-3xl font-black text-slate-100 font-mono">
            {loading && !balance ? '...' : formatBolivares(balance?.availableBalance || 0)}
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1 font-semibold">
            {formatUsd(balance?.availableBalance || 0)}
          </div>
          <span className="text-[11px] text-emerald-400 mt-2 block flex items-center gap-1 border-t border-slate-800/60 pt-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Listo para jugar o retirar
          </span>
        </Card>

        <Card id="card-held-balance" className="bg-slate-900/90">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Saldo Retenido
          </span>
          <div className="text-2xl sm:text-3xl font-black text-slate-300 font-mono">
            {loading && !balance ? '...' : formatBolivares(balance?.heldBalance || 0)}
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1 font-semibold">
            {formatUsd(balance?.heldBalance || 0)}
          </div>
          <span className="text-[11px] text-slate-400 mt-2 block flex items-center gap-1 border-t border-slate-800/60 pt-1.5">
            <Lock className="w-3.5 h-3.5" />
            En mesas activas o retiros
          </span>
        </Card>

        <Card id="card-total-balance" className="bg-slate-900/90">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Saldo Total
          </span>
          <div className="text-2xl sm:text-3xl font-black text-slate-100 font-mono">
            {loading && !balance ? '...' : formatBolivares(balance?.totalBalance || 0)}
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1 font-semibold">
            {formatUsd(balance?.totalBalance || 0)}
          </div>
          <span className="text-[11px] text-slate-400 mt-2 block flex items-center gap-1 border-t border-slate-800/60 pt-1.5">
            <Clock className="w-3.5 h-3.5" />
            Patrimonio total en cuenta
          </span>
        </Card>
      </div>

      {/* Acciones Financieras */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card
          id="card-action-deposit"
          header={
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
              <span>Recargar Saldo (Pago Móvil / Transferencia)</span>
            </div>
          }
        >
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            Envía tu recarga con Pago Móvil a los datos de la plataforma y registra el número de referencia para acreditar tu saldo.
          </p>
          <Button
            id="btn-open-deposit-modal"
            variant="primary"
            className="w-full"
            onClick={() => {
              setDepositFeedback(null);
              setShowDepositModal(true);
            }}
          >
            Solicitar Recarga
          </Button>
        </Card>

        <Card
          id="card-action-withdrawal"
          header={
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <ArrowUpRight className="w-4 h-4 text-amber-400" />
              <span>Solicitar Retiro a Pago Móvil</span>
            </div>
          }
        >
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            Retira tus ganancias directamente a tu cuenta bancaria registrada con verificación contable y retención auditada.
          </p>
          {isAdminOrOperator ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-center gap-2">
              <Lock className="w-4 h-4 flex-shrink-0 text-amber-400" />
              <span>Función deshabilitada para perfiles administrativos y operativos.</span>
            </div>
          ) : (
            <Button
              id="btn-open-withdraw-modal"
              variant="outline"
              className="w-full text-slate-300 border-amber-500/30 hover:bg-amber-500/10"
              onClick={() => {
                setWithdrawFeedback(null);
                setShowWithdrawModal(true);
              }}
            >
              Solicitar Retiro
            </Button>
          )}
        </Card>
      </div>

      {/* Cuentas Bancarias Registradas */}
      <Card
        id="card-payment-accounts"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <Building className="w-4 h-4 text-amber-400" />
              <span>Cuentas de Pago Móvil Registradas</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAccountFeedback(null);
                setShowAccountModal(true);
              }}
              leftIcon={<PlusCircle className="w-3.5 h-3.5" />}
            >
              Nueva Cuenta
            </Button>
          </div>
        }
      >
        {paymentAccounts.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-xs">
            No tienes ninguna cuenta de Pago Móvil registrada. Añade una para poder recibir retiros.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {paymentAccounts.map((acc) => (
              <div key={acc.id} className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">{acc.bankName}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    {acc.bankCode}
                  </span>
                </div>
                <div className="text-slate-400">Titular: {acc.accountHolderName}</div>
                <div className="text-slate-400 font-mono">
                  Tel: {maskPhone(acc.phoneNumber)} | Cédula: {maskCedula(acc.idDocument)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Historial de Movimientos del Ledger */}
      <Card
        id="card-transaction-history"
        header={
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm text-slate-200">Últimos Movimientos del Ledger Contable</span>
            <span className="text-[11px] text-slate-400 font-mono">Fuente: ledger_entries</span>
          </div>
        }
      >
        {transactions.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            No existen movimientos registrados en el Ledger para este usuario.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {transactions.map((tx) => (
              <div key={tx.id} className="py-3 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200 uppercase">{tx.type}</span>
                    {tx.direction && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        tx.direction === 'CREDIT' ? 'bg-emerald-950/60 text-emerald-400' :
                        tx.direction === 'HOLD' ? 'bg-amber-950/60 text-amber-400' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {tx.direction}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {tx.description || tx.reference} • {new Date(tx.createdAt).toLocaleString('es-VE')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-slate-200">
                    {formatBolivares(tx.amount)}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 font-semibold" title="Equivalente informativo según tasa BCV actual">
                    {formatUsd(tx.amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal Solicitar Recarga */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between sticky top-0 bg-slate-900 pt-1 pb-2 border-b border-slate-800/80 z-10">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Solicitud de Recarga</span>
              </h2>
              <button
                onClick={() => setShowDepositModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white touch-manipulation min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Datos para Pago Móvil */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1 text-xs text-slate-300">
              <span className="font-semibold text-amber-300 block mb-1">Datos Oficiales Pago Móvil:</span>
              <div>Banco: <strong>0102 - Banco de Venezuela</strong></div>
              <div>Teléfono: <strong>0412-1234567</strong></div>
              <div>Cédula: <strong>J-123456789</strong></div>
            </div>

            <form onSubmit={handleDepositSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Monto en Bolívares (Bs.)</label>
                <input
                  type="number"
                  min={25}
                  max={50000}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                  <span>Equivalente informativo:</span>
                  <span className="font-mono font-semibold text-slate-200">{formatUsd(depositAmount)}</span>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Banco Emisor (Pago Móvil)</label>
                <select
                  value={depositOriginBank}
                  onChange={(e) => setDepositOriginBank(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="0102 - Banco de Venezuela">0102 - Banco de Venezuela</option>
                  <option value="0108 - Banco Provincial">0108 - Banco Provincial</option>
                  <option value="0134 - Banesco">0134 - Banesco</option>
                  <option value="0105 - Banco Mercantil">0105 - Banco Mercantil</option>
                  <option value="0172 - Bancamiga">0172 - Bancamiga</option>
                  <option value="0114 - Bancaribe">0114 - Bancaribe</option>
                  <option value="0163 - Banco del Tesoro">0163 - Banco del Tesoro</option>
                  <option value="0175 - Banco Bicentenario">0175 - Banco Bicentenario</option>
                  <option value="0191 - Banco Nacional de Crédito (BNC)">0191 - Banco Nacional de Crédito (BNC)</option>
                  <option value="0174 - Banplus">0174 - Banplus</option>
                  <option value="0177 - BANFANB">0177 - BANFANB</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Número de Referencia Bancaria *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 984721"
                  value={depositReference}
                  onChange={(e) => setDepositReference(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* SECCIÓN COMPROBANTE DE PAGO OBLIGATORIO */}
              <div className="space-y-1.5 border-t border-slate-800 pt-3">
                <label className="block font-bold text-slate-200">
                  COMPROBANTE DE PAGO <span className="text-amber-400">*</span>
                </label>
                <p className="text-[11px] text-slate-400">
                  Adjunta una imagen clara de tu comprobante de pago (JPG, JPEG, PNG, WEBP).
                </p>

                {receiptPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-amber-500/40 bg-slate-950 p-2 space-y-2">
                    <img
                      src={receiptPreview}
                      alt="Vista previa del comprobante"
                      className="max-h-48 w-full object-contain rounded-lg"
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-300 px-1">
                      <span className="truncate max-w-[200px] font-mono">{receiptFile?.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptFile(null);
                          setReceiptPreview(null);
                        }}
                        className="text-red-400 hover:text-red-300 font-bold cursor-pointer"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-700 hover:border-amber-500/50 rounded-xl bg-slate-950 cursor-pointer transition-colors text-center">
                    <Upload className="w-6 h-6 text-amber-400 mb-1 animate-bounce" />
                    <span className="text-xs font-bold text-slate-100">[ 📷 SUBIR COMPROBANTE ]</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">Formatos aceptados: JPG, JPEG, PNG, WEBP</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
                          if (file.type && !allowedTypes.includes(file.type.toLowerCase())) {
                            setDepositFeedback({
                              success: false,
                              message: 'El comprobante debe ser una imagen válida (JPG, JPEG, PNG, WEBP).',
                            });
                            return;
                          }
                          if (file.size > 10 * 1024 * 1024) {
                            setDepositFeedback({
                              success: false,
                              message: 'El archivo supera el tamaño permitido (máximo 10MB).',
                            });
                            return;
                          }
                          setDepositFeedback(null);
                          setReceiptFile(file);
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setReceiptPreview(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {depositFeedback && (
                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                    depositFeedback.success
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-red-950/40 border-red-800/60 text-red-300'
                  }`}
                >
                  {depositFeedback.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <span>{depositFeedback.message}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowDepositModal(false)}>
                  Cerrar
                </Button>
                <Button type="submit" variant="primary" disabled={submittingDeposit || !depositReference.trim()}>
                  {submittingDeposit ? 'Enviando...' : 'Enviar Comprobante'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Solicitar Retiro */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between sticky top-0 bg-slate-900 pt-1 pb-2 border-b border-slate-800/80 z-10">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Solicitud de Retiro</span>
              </h2>
              <button
                onClick={() => {
                  setShowWithdrawModal(false);
                  setCaptchaToken(null);
                }}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white touch-manipulation min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {paymentAccounts.length === 0 ? (
              <div className="space-y-4 text-xs">
                <p className="text-slate-400">
                  Para poder solicitar un retiro, primero debes registrar una cuenta de Pago Móvil.
                </p>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    setShowWithdrawModal(false);
                    setShowAccountModal(true);
                  }}
                >
                  Registrar Cuenta Ahora
                </Button>
              </div>
            ) : (
              <form onSubmit={handleWithdrawSubmit} className="space-y-4 text-xs">
                {/* BANNER DESTACADO DE SALDO DISPONIBLE Y RESERVA */}
                <div className="p-3.5 bg-slate-950 rounded-2xl border border-amber-500/30 space-y-1.5">
                  <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                    Saldo Disponible para Retiro
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    {formatBolivares(balance?.availableBalance || 0)}
                  </div>
                  {balance && balance.heldBalance > 0 && (
                    <div className="text-[11px] text-slate-400 pt-1.5 border-t border-slate-800 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        Tienes <strong className="text-amber-300 font-mono">{formatBolivares(balance.heldBalance)}</strong> en reserva (mesas activas o retiros pendientes).
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Cuenta Destino (Pago Móvil)</label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    {paymentAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.bankName} - {maskPhone(acc.phoneNumber)} ({acc.accountHolderName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Monto a Retirar (Disponible: {formatBolivares(balance?.availableBalance || 0)})
                  </label>
                  <input
                    type="number"
                    min={25}
                    max={balance?.availableBalance || 10000}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                    <span>Equivalente informativo:</span>
                    <span className="font-mono font-semibold text-amber-300">{formatUsd(withdrawAmount)}</span>
                  </div>
                </div>

                {profile?.isMfaEnabled && (
                  <div>
                    <label className="block font-medium text-amber-300 mb-1 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Código Autenticador (2FA) *</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={12}
                      placeholder="000000"
                      value={withdrawTotpCode}
                      onChange={(e) => setWithdrawTotpCode(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-amber-500/50 rounded-xl text-slate-100 font-mono text-center font-bold tracking-widest text-base focus:outline-none focus:border-amber-400"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Ingresa el código de 6 dígitos de tu app de autenticación o un código de recuperación de emergencia.
                    </p>
                  </div>
                )}

                {withdrawFeedback && (
                  <div
                    className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                      withdrawFeedback.success
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                        : 'bg-red-950/40 border-red-800/60 text-red-300'
                    }`}
                  >
                    {withdrawFeedback.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <span>{withdrawFeedback.message}</span>
                  </div>
                )}

                {/* VERIFICACIÓN HUMANA CLOUDFLARE TURNSTILE (RETIROS) */}
                <div className="pt-2">
                  <CloudflareCaptcha
                    onVerify={(token) => {
                      setCaptchaToken(token);
                      setWithdrawFeedback(null);
                    }}
                    onExpire={() => setCaptchaToken(null)}
                    size="compact"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowWithdrawModal(false);
                      setCaptchaToken(null);
                    }}
                  >
                    Cerrar
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={
                      submittingWithdraw ||
                      !captchaToken ||
                      withdrawAmount <= 0 ||
                      (balance && withdrawAmount > balance.availableBalance)
                    }
                  >
                    {submittingWithdraw ? 'Procesando Retiro...' : 'Confirmar Retiro'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Registrar Cuenta Pago Móvil */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between sticky top-0 bg-slate-900 pt-1 pb-2 border-b border-slate-800/80 z-10">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Building className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Registrar Pago Móvil</span>
              </h2>
              <button
                onClick={() => setShowAccountModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white touch-manipulation min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccountSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Banco</label>
                <select
                  value={newBankCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setNewBankCode(code);
                    const names: Record<string, string> = {
                      '0102': 'Banco de Venezuela',
                      '0108': 'Banco Provincial',
                      '0134': 'Banesco',
                      '0105': 'Banco Mercantil',
                      '0114': 'Bancaribe',
                      '0172': 'Bancamiga',
                      '0116': 'Banco Occidental de Descuento (BOD)',
                      '0169': 'Mi Banco',
                    };
                    setNewBankName(names[code] || 'Banco Nacional');
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="0102">0102 - Banco de Venezuela</option>
                  <option value="0108">0108 - Banco Provincial</option>
                  <option value="0134">0134 - Banesco</option>
                  <option value="0105">0105 - Banco Mercantil</option>
                  <option value="0172">0172 - Bancamiga</option>
                  <option value="0114">0114 - Bancaribe</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Número de Teléfono</label>
                <input
                  type="text"
                  placeholder="04121234567"
                  maxLength={11}
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Cédula de Identidad (V / E / J)</label>
                <input
                  type="text"
                  placeholder="V-12345678"
                  value={newIdDoc}
                  onChange={(e) => setNewIdDoc(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Nombre Completo del Titular</label>
                <input
                  type="text"
                  placeholder="Nombre y Apellido"
                  value={newHolderName}
                  onChange={(e) => setNewHolderName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              {accountFeedback && (
                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                    accountFeedback.success
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-red-950/40 border-red-800/60 text-red-300'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{accountFeedback.message}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowAccountModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={creatingAccount}>
                  {creatingAccount ? 'Guardando...' : 'Guardar Cuenta'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
