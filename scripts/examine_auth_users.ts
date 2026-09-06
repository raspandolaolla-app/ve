import fs from 'fs';
import path from 'path';

const report = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'phase_0_5_report.json'), 'utf-8'));

console.log('=== LOS 14 USUARIOS REALES EN AUTH.USERS ===\n');

// Filtramos los dossiers que realmente tienen registro en auth.users
const authDossiers = report.userDossiers.filter((d: any) => d.auth !== null);

console.log(`Total usuarios en auth.users: ${authDossiers.length}\n`);

for (let i = 0; i < authDossiers.length; i++) {
  const d = authDossiers[i];
  console.log(`[#${i + 1}] UUID: ${d.userId}`);
  console.log(`  Email: ${d.email}`);
  console.log(`  Roles: ${d.roles.join(', ') || 'PLAYER'}`);
  console.log(`  Nombre Perfil: ${d.profile?.display_name || d.profile?.nombre_real || 'SIN PERFIL'}`);
  console.log(`  Cédula: ${d.profile?.cedula || d.profile?.cedula_last4 || 'N/A'}`);
  console.log(`  Teléfono: ${d.profile?.telefono || d.profile?.phone_number || 'N/A'}`);
  console.log(`  KYC: ${d.profile?.kyc_status || 'N/A'}`);
  console.log(`  Creado Auth: ${d.auth.createdAt} | Confirmado: ${d.auth.confirmedAt} | Último Login: ${d.auth.lastSignInAt}`);
  console.log(`  Metadata Auth:`, JSON.stringify(d.auth.rawUserMetaData));
  console.log(`  Wallet: Balance=${d.wallet?.balance} | Available=${d.wallet?.available} | Held=${d.wallet?.held}`);
  console.log(`  Ledger: Total=${d.financialReconciliation.totalLedgerCount} | Credits=${d.financialReconciliation.ledgerCredits} | Debits=${d.financialReconciliation.ledgerDebits} | SignedSum=${d.financialReconciliation.ledgerSumSigned}`);
  console.log(`  Ledger EntryTypes:`, JSON.stringify(d.financialReconciliation.ledgerByEntryType));
  console.log(`  Ledger Directions:`, JSON.stringify(d.financialReconciliation.ledgerByDirection));
  console.log(`  Depósitos: Total=${d.deposits.length} | Aprobados=${d.financialReconciliation.approvedDepositsSum}`);
  console.log(`  Premios/Settlements: Total=${d.settlementsWon.length} | Sum=${d.financialReconciliation.settlementsPrizesSum}`);
  console.log(`  Bingo: Compras=${d.bingo.totalPurchases} | Cards=${d.bingo.totalCards} | Gasto=${d.bingo.totalSpent}`);
  console.log(`  Polla: Tickets=${d.polla.totalTickets} | Gasto=${d.polla.totalSpent} | Premios=${d.polla.totalPrizes}`);
  console.log(`  Mesas creadas: ${d.gameTablesHosted.count} (${d.gameTablesHosted.types.join(',')}) | Mesas jugadas: ${d.gameTablesPlayed.count}`);
  console.log(`  Payment Accounts: ${d.paymentAccounts.length} | Storage: ${d.storageObjects.length} | Audit Logs: ${d.auditLogs.length}`);
  console.log('--------------------------------------------------------------------------------');
}
