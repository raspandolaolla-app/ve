import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

let connectionString = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();

if (!connectionString) {
  try {
    const envContent = fs.readFileSync('.env', 'utf-8');
    const match = envContent.match(/(?:DATABASE_URL|SUPABASE_DB_URL)=["']?([^"'\r\n]+)["']?/);
    if (match) {
      connectionString = match[1].trim();
    }
  } catch {}
}

if (!connectionString) {
  console.error('Error: DATABASE_URL o SUPABASE_DB_URL no encontrada en el entorno.');
  process.exit(1);
}

connectionString = connectionString.replace(/:\/\/([^:]+):\[([^\]]+)\]@/, '://$1:$2@');

async function runForensics() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    // 100% READ-ONLY ENFORCE
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;');
    console.log('=== CONEXIÓN A BASE DE DATOS ESTABLECIDA EN MODO ESTRICTO READ-ONLY ===');

    const forensics: any = {};

    // 1. AUTH USERS
    const authUsers = (
      await client.query(`
        SELECT id, email, created_at, last_sign_in_at, confirmed_at, 
               raw_user_meta_data, is_anonymous
        FROM auth.users
        ORDER BY created_at ASC
      `)
    ).rows;
    forensics.authUsersCount = authUsers.length;

    // 2. PROFILES
    const profiles = (await client.query(`SELECT * FROM public.profiles`)).rows;

    // 3. USER ROLES
    const userRoles = (await client.query(`SELECT * FROM public.user_roles`)).rows;

    // 4. WALLETS
    const wallets = (await client.query(`SELECT * FROM public.wallets`)).rows;

    // 5. LEDGER ENTRIES
    const ledgerEntries = (await client.query(`SELECT * FROM public.ledger_entries ORDER BY created_at ASC`)).rows;
    forensics.totalLedgerEntries = ledgerEntries.length;

    // 6. DEPOSITS
    const deposits = (await client.query(`SELECT * FROM public.deposit_requests ORDER BY created_at ASC`)).rows;
    forensics.totalDeposits = deposits.length;

    // 7. WITHDRAWALS
    const withdrawals = (await client.query(`SELECT * FROM public.withdrawal_requests ORDER BY created_at ASC`)).rows;
    forensics.totalWithdrawals = withdrawals.length;

    // 8. PAYMENT ACCOUNTS
    const paymentAccounts = (await client.query(`SELECT * FROM public.payment_accounts ORDER BY created_at ASC`)).rows;
    forensics.paymentAccounts = paymentAccounts;

    // 9. SETTLEMENTS & RECIPIENTS
    const settlements = (await client.query(`SELECT * FROM public.game_settlements ORDER BY settled_at ASC`)).rows;
    forensics.totalSettlements = settlements.length;

    const settlementRecipients = (await client.query(`SELECT * FROM public.game_settlement_recipients ORDER BY created_at ASC`)).rows;
    forensics.totalSettlementRecipients = settlementRecipients.length;

    // 10. BINGO PURCHASES
    const bingoPurchases = (await client.query(`SELECT * FROM public.bingo_card_purchases ORDER BY created_at ASC`)).rows;
    forensics.totalBingoPurchases = bingoPurchases.length;

    // 11. POLLA TICKETS
    const pollaTickets = (await client.query(`SELECT * FROM public.polla_tickets ORDER BY draw_date ASC`)).rows;
    forensics.totalPollaTickets = pollaTickets.length;

    // 12. GAME TABLES & PLAYERS
    const gameTables = (await client.query(`SELECT id, game_type, host_user_id, status, created_at FROM public.game_tables`)).rows;
    forensics.totalGameTables = gameTables.length;

    const gameTablePlayers = (await client.query(`SELECT id, table_id, user_id, status, joined_at FROM public.game_table_players`)).rows;
    forensics.totalGameTablePlayers = gameTablePlayers.length;

    // 13. KYC VERIFICATIONS
    const kycVerifications = (await client.query(`SELECT * FROM public.kyc_verifications ORDER BY submitted_at ASC`)).rows;
    forensics.totalKycVerifications = kycVerifications.length;

    // 14. 2FA / TOTP SECRETS
    let totpSecrets: any[] = [];
    try {
      totpSecrets = (await client.query(`SELECT * FROM public.user_totp_secrets`)).rows;
    } catch {
      try {
        totpSecrets = (await client.query(`SELECT * FROM public.user_2fa_secrets`)).rows;
      } catch {}
    }

    // 15. STORAGE OBJECTS
    const storageObjects = (await client.query(`SELECT * FROM storage.objects ORDER BY created_at ASC`)).rows;
    forensics.storageObjects = storageObjects;

    // 16. AUDIT LOGS
    const auditLogs = (await client.query(`SELECT * FROM public.audit_logs ORDER BY created_at ASC`)).rows;
    forensics.totalAuditLogs = auditLogs.length;

    // 17. OPERATOR RPCS & POLICIES
    const operatorRpcs = (
      await client.query(`
        SELECT routine_name, routine_definition
        FROM information_schema.routines
        WHERE routine_schema = 'public' 
          AND (routine_definition ILIKE '%OPERATOR%' OR routine_definition ILIKE '%operator%')
      `)
    ).rows;
    forensics.operatorRpcs = operatorRpcs.map((r) => r.routine_name);

    const operatorPolicies = (
      await client.query(`
        SELECT schemaname, tablename, policyname, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public' 
          AND (qual ILIKE '%OPERATOR%' OR with_check ILIKE '%OPERATOR%')
      `)
    ).rows;
    forensics.operatorPolicies = operatorPolicies;

    // 18. CONSTRUCCIÓN DE EXPEDIENTE PARA CADA UNO DE LOS 14 USUARIOS
    const allUserIds = new Set<string>();
    authUsers.forEach((u) => allUserIds.add(u.id));
    profiles.forEach((p) => {
      if (p.id) allUserIds.add(p.id);
      if (p.user_id) allUserIds.add(p.user_id);
    });

    const userDossiers: any[] = [];

    for (const userId of Array.from(allUserIds)) {
      const auth = authUsers.find((u) => u.id === userId);
      const profile = profiles.find((p) => p.id === userId || p.user_id === userId);
      const roles = userRoles.filter((r) => r.user_id === userId).map((r) => r.role);
      const wallet = wallets.find((w) => w.user_id === userId);
      const userLedger = ledgerEntries.filter((l) => l.user_id === userId);
      const userDeposits = deposits.filter((d) => d.user_id === userId);
      const userWithdrawals = withdrawals.filter((w) => w.user_id === userId);
      const userSettlementRecips = settlementRecipients.filter((s) => s.user_id === userId);
      const userBingo = bingoPurchases.filter((b) => b.user_id === userId);
      const userPolla = pollaTickets.filter((p) => p.user_id === userId);
      const userTablesHosted = gameTables.filter((t) => t.host_user_id === userId);
      const userTablesPlayed = gameTablePlayers.filter((p) => p.user_id === userId);
      const userKyc = kycVerifications.filter((k) => k.user_id === userId);
      const userPaymentAccounts = paymentAccounts.filter((p) => p.user_id === userId);
      const userStorage = storageObjects.filter((s) => s.owner === userId || s.name.includes(userId));
      const userAuditLogs = auditLogs.filter((a) => a.actor_id === userId || a.resource_id === userId);
      const userTotp = totpSecrets.find((t) => t.user_id === userId);

      // Agrupación contable de ledger
      let sumSignedAmount = 0;
      let sumCredits = 0;
      let sumDebits = 0;
      const ledgerByEntryType: Record<string, { count: number; sum: number }> = {};
      const ledgerByDirection: Record<string, { count: number; sum: number }> = {};
      const ledgerByTxType: Record<string, { count: number; sum: number }> = {};

      for (const entry of userLedger) {
        const amt = Number(entry.amount);
        sumSignedAmount += amt;
        if (entry.direction === 'CREDIT' || amt > 0) {
          sumCredits += Math.abs(amt);
        } else {
          sumDebits += Math.abs(amt);
        }

        const et = entry.entry_type || 'UNKNOWN';
        if (!ledgerByEntryType[et]) ledgerByEntryType[et] = { count: 0, sum: 0 };
        ledgerByEntryType[et].count++;
        ledgerByEntryType[et].sum += amt;

        const dir = entry.direction || 'UNKNOWN';
        if (!ledgerByDirection[dir]) ledgerByDirection[dir] = { count: 0, sum: 0 };
        ledgerByDirection[dir].count++;
        ledgerByDirection[dir].sum += amt;

        const tt = entry.transaction_type || 'UNKNOWN';
        if (!ledgerByTxType[tt]) ledgerByTxType[tt] = { count: 0, sum: 0 };
        ledgerByTxType[tt].count++;
        ledgerByTxType[tt].sum += amt;
      }

      const walletBal = wallet ? Number(wallet.balance) : 0;
      const walletAvailable = wallet ? Number(wallet.available_balance) : 0;
      const walletHeld = wallet ? Number(wallet.held_balance) : 0;

      // Depósitos completados
      const approvedDeposits = userDeposits.filter((d) => d.status === 'COMPLETED' || d.status === 'APPROVED');
      const sumApprovedDeposits = approvedDeposits.reduce((acc, d) => acc + Number(d.amount), 0);

      // Premios recibidos
      const sumPrizes = userSettlementRecips.reduce((acc, r) => acc + Number(r.payout_amount || 0), 0);

      userDossiers.push({
        userId,
        email: auth?.email || profile?.email || 'SIN EMAIL',
        auth: auth
          ? {
              id: auth.id,
              email: auth.email,
              createdAt: auth.created_at,
              lastSignInAt: auth.last_sign_in_at,
              confirmedAt: auth.confirmed_at,
              rawUserMetaData: auth.raw_user_meta_data,
              isAnonymous: auth.is_anonymous,
            }
          : null,
        profile: profile || null,
        roles,
        totpActive: !!userTotp?.is_active,
        wallet: wallet
          ? {
              balance: walletBal,
              available: walletAvailable,
              held: walletHeld,
              currency: wallet.currency,
              updatedAt: wallet.updated_at,
            }
          : null,
        financialReconciliation: {
          walletBalance: walletBal,
          ledgerSumSigned: sumSignedAmount,
          ledgerCredits: sumCredits,
          ledgerDebits: sumDebits,
          diffWalletMinusLedger: walletBal - sumSignedAmount,
          reconciliationMatch: Math.abs(walletBal - sumSignedAmount) < 0.01,
          approvedDepositsSum: sumApprovedDeposits,
          settlementsPrizesSum: sumPrizes,
          ledgerByEntryType,
          ledgerByDirection,
          ledgerByTxType,
          totalLedgerCount: userLedger.length,
        },
        deposits: userDeposits.map((d) => ({
          id: d.id,
          amount: Number(d.amount),
          status: d.status,
          ref: d.reference_number,
          bank: d.origin_bank,
          paymentDate: d.payment_date,
          createdAt: d.created_at,
          reviewedBy: d.reviewed_by,
          destinationAccountId: d.destination_account_id,
          receiptUrl: d.receipt_url,
          storagePath: d.storage_path,
        })),
        withdrawals: userWithdrawals.map((w) => ({
          id: w.id,
          amount: Number(w.amount),
          status: w.status,
          createdAt: w.created_at,
        })),
        paymentAccounts: userPaymentAccounts.map((p) => ({
          id: p.id,
          bankName: p.bank_name,
          bankCode: p.bank_code,
          phone: p.phone_number,
          idNumberMasked: p.id_number_masked,
          isVerified: p.is_verified,
          isActive: p.is_active,
          isDefault: p.is_default,
          createdAt: p.created_at,
        })),
        settlementsWon: userSettlementRecips.map((r) => ({
          id: r.id,
          settlementId: r.settlement_id,
          amount: Number(r.payout_amount),
          status: r.payout_status,
          createdAt: r.created_at,
        })),
        bingo: {
          totalPurchases: userBingo.length,
          totalCards: userBingo.reduce((acc, b) => acc + Number(b.card_count || 0), 0),
          totalSpent: userBingo.reduce((acc, b) => acc + Number(b.total_cost || 0), 0),
        },
        polla: {
          totalTickets: userPolla.length,
          totalSpent: userPolla.reduce((acc, p) => acc + Number(p.cost_bs || 0), 0),
          totalPrizes: userPolla.reduce((acc, p) => acc + Number(p.prize_bs || 0), 0),
        },
        gameTablesHosted: {
          count: userTablesHosted.length,
          types: Array.from(new Set(userTablesHosted.map((t) => t.game_type))),
        },
        gameTablesPlayed: {
          count: userTablesPlayed.length,
        },
        kyc: userKyc.map((k) => ({
          id: k.id,
          documentType: k.document_type,
          storagePath: k.document_storage_path,
          status: k.status,
          method: k.verification_method,
          submittedAt: k.submitted_at,
          reviewedAt: k.reviewed_at,
        })),
        storageObjects: userStorage.map((s) => ({
          id: s.id,
          bucketId: s.bucket_id,
          name: s.name,
          createdAt: s.created_at,
          size: s.metadata?.size,
          mimetype: s.metadata?.mimetype,
        })),
        auditLogs: userAuditLogs.map((a) => ({
          id: a.id,
          action: a.action,
          role: a.actor_role,
          resourceType: a.resource_type,
          resourceId: a.resource_id,
          metadata: a.metadata,
          createdAt: a.created_at,
        })),
      });
    }

    forensics.userDossiers = userDossiers;

    // 19. ANALISIS DE DETALLE DE LOS 2 SUPER ADMINS
    const francisco = userDossiers.find((u) => u.userId === 'b733db64-4912-4a33-8d7a-4ee332c7b5f1');
    const pulsoPlay = userDossiers.find((u) => u.userId === '42b24c41-83a5-4c68-ab8c-7dd09f1a5217');

    forensics.superAdminFranciscoAnalysis = {
      user: francisco?.email,
      walletBalance: francisco?.wallet?.balance,
      reconciliation: francisco?.financialReconciliation,
      deposits: francisco?.deposits,
      allLedgerEntries: ledgerEntries
        .filter((l) => l.user_id === 'b733db64-4912-4a33-8d7a-4ee332c7b5f1')
        .map((l) => ({
          id: l.id,
          amount: Number(l.amount),
          balanceAfter: Number(l.balance_after || l.balance_after_available),
          entryType: l.entry_type,
          transactionType: l.transaction_type,
          direction: l.direction,
          description: l.description,
          refTable: l.reference_table,
          createdAt: l.created_at,
        })),
    };

    forensics.superAdminPulsoPlayAnalysis = {
      user: pulsoPlay?.email,
      walletBalance: pulsoPlay?.wallet?.balance,
      reconciliation: pulsoPlay?.financialReconciliation,
      deposits: pulsoPlay?.deposits,
      allLedgerEntries: ledgerEntries
        .filter((l) => l.user_id === '42b24c41-83a5-4c68-ab8c-7dd09f1a5217')
        .map((l) => ({
          id: l.id,
          amount: Number(l.amount),
          balanceAfter: Number(l.balance_after || l.balance_after_available),
          entryType: l.entry_type,
          transactionType: l.transaction_type,
          direction: l.direction,
          description: l.description,
          refTable: l.reference_table,
          createdAt: l.created_at,
        })),
    };

    // 20. ANALISIS DETALLADO DE TODAS LAS 45 AUDIT LOGS
    const auditLogsSummary: Record<string, { count: number; examples: any[] }> = {};
    for (const log of auditLogs) {
      const act = log.action || 'UNKNOWN';
      if (!auditLogsSummary[act]) auditLogsSummary[act] = { count: 0, examples: [] };
      auditLogsSummary[act].count++;
      if (auditLogsSummary[act].examples.length < 3) {
        auditLogsSummary[act].examples.push({
          actorId: log.actor_id,
          role: log.actor_role,
          resType: log.resource_type,
          resId: log.resource_id,
          meta: log.metadata,
          created: log.created_at,
        });
      }
    }
    forensics.auditLogsSummary = auditLogsSummary;

    // 21. ANALISIS DETALLADO DE TODOS LOS 8 OBJETOS DE STORAGE
    forensics.storageDetailedList = storageObjects.map((s) => {
      // Buscar quién es el dueño
      const ownerUser = userDossiers.find((u) => u.userId === s.owner || s.name.includes(u.userId));
      return {
        id: s.id,
        bucket: s.bucket_id,
        name: s.name,
        ownerId: s.owner,
        matchedUserEmail: ownerUser?.email || 'UNKNOWN',
        matchedUserName: ownerUser?.profile?.display_name || 'UNKNOWN',
        matchedUserRole: ownerUser?.roles || [],
        createdAt: s.created_at,
        size: s.metadata?.size,
        mimetype: s.metadata?.mimetype,
      };
    });

    // Guardar archivo JSON completo
    fs.writeFileSync(
      path.join(process.cwd(), 'scripts', 'phase_0_5_report.json'),
      JSON.stringify(forensics, null, 2),
      'utf-8'
    );
    console.log('=== FORENSE FASE 0.5 COMPLETADO CON ÉXITO ===');
  } catch (err) {
    console.error('Error durante ejecución forense:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runForensics();
