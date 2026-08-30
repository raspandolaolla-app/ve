-- ================================================================
-- MIGRACIÓN 015: Políticas de Seguridad Row Level Security (RLS)
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

-- ================================================================
-- 1. Políticas RLS: profiles
-- ================================================================
DROP POLICY IF EXISTS p_profiles_select ON public.profiles;
CREATE POLICY p_profiles_select ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_profiles_insert ON public.profiles;
CREATE POLICY p_profiles_insert ON public.profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND account_status = 'PENDING_VERIFICATION'
    AND kyc_status = 'UNSUBMITTED'
  );

DROP POLICY IF EXISTS p_profiles_update ON public.profiles;
CREATE POLICY p_profiles_update ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    -- Los administradores pueden modificar cualquier campo
    public.is_admin(auth.uid())
    OR
    -- El propio usuario solo puede actualizar campos de presentación personal, no su estatus ni identidad
    (
      auth.uid() = user_id 
      AND account_status = (SELECT p.account_status FROM public.profiles p WHERE p.user_id = auth.uid())
      AND kyc_status = (SELECT p.kyc_status FROM public.profiles p WHERE p.user_id = auth.uid())
      AND cedula_hash = (SELECT p.cedula_hash FROM public.profiles p WHERE p.user_id = auth.uid())
      AND cedula_last4 = (SELECT p.cedula_last4 FROM public.profiles p WHERE p.user_id = auth.uid())
      AND birth_date = (SELECT p.birth_date FROM public.profiles p WHERE p.user_id = auth.uid())
    )
  );

-- ================================================================
-- 2. Políticas RLS: user_roles
-- ================================================================
DROP POLICY IF EXISTS p_user_roles_select ON public.user_roles;
CREATE POLICY p_user_roles_select ON public.user_roles
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS p_user_roles_admin_all ON public.user_roles;
CREATE POLICY p_user_roles_admin_all ON public.user_roles
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ================================================================
-- 3. Políticas RLS: wallets (Solo lectura directa; escritura vía RPC)
-- ================================================================
DROP POLICY IF EXISTS p_wallets_select ON public.wallets;
CREATE POLICY p_wallets_select ON public.wallets
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_admin(auth.uid())
  );

-- ================================================================
-- 4. Políticas RLS: ledger_entries (Solo lectura; escritura vía RPC)
-- ================================================================
DROP POLICY IF EXISTS p_ledger_select ON public.ledger_entries;
CREATE POLICY p_ledger_select ON public.ledger_entries
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_operator_or_above(auth.uid())
  );

-- ================================================================
-- 5. Políticas RLS: payment_accounts
-- ================================================================
DROP POLICY IF EXISTS p_payment_accounts_select ON public.payment_accounts;
CREATE POLICY p_payment_accounts_select ON public.payment_accounts
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_payment_accounts_insert ON public.payment_accounts;
CREATE POLICY p_payment_accounts_insert ON public.payment_accounts
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    AND is_verified = FALSE
  );

DROP POLICY IF EXISTS p_payment_accounts_update ON public.payment_accounts;
CREATE POLICY p_payment_accounts_update ON public.payment_accounts
  FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (
      auth.uid() = user_id 
      AND is_verified = (SELECT pa.is_verified FROM public.payment_accounts pa WHERE pa.id = id)
    )
  );

DROP POLICY IF EXISTS p_payment_accounts_delete ON public.payment_accounts;
CREATE POLICY p_payment_accounts_delete ON public.payment_accounts
  FOR DELETE
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- ================================================================
-- 6. Políticas RLS: deposit_requests
-- ================================================================
DROP POLICY IF EXISTS p_deposit_select ON public.deposit_requests;
CREATE POLICY p_deposit_select ON public.deposit_requests
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_deposit_insert ON public.deposit_requests;
CREATE POLICY p_deposit_insert ON public.deposit_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'PENDING');

DROP POLICY IF EXISTS p_deposit_update ON public.deposit_requests;
CREATE POLICY p_deposit_update ON public.deposit_requests
  FOR UPDATE
  USING (
    (auth.uid() = user_id AND status = 'PENDING')
    OR public.is_operator_or_above(auth.uid())
  )
  WITH CHECK (
    (auth.uid() = user_id AND status = 'CANCELLED')
    OR public.is_operator_or_above(auth.uid())
  );

-- ================================================================
-- 7. Políticas RLS: withdrawal_requests (Creación solo vía RPC)
-- ================================================================
DROP POLICY IF EXISTS p_withdrawal_select ON public.withdrawal_requests;
CREATE POLICY p_withdrawal_select ON public.withdrawal_requests
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_withdrawal_update ON public.withdrawal_requests;
CREATE POLICY p_withdrawal_update ON public.withdrawal_requests
  FOR UPDATE
  USING (
    (auth.uid() = user_id AND status = 'PENDING')
    OR public.is_operator_or_above(auth.uid())
  )
  WITH CHECK (
    (auth.uid() = user_id AND status = 'CANCELLED')
    OR public.is_operator_or_above(auth.uid())
  );

-- ================================================================
-- 8. Políticas RLS: game_tables
-- ================================================================
DROP POLICY IF EXISTS p_tables_select ON public.game_tables;
CREATE POLICY p_tables_select ON public.game_tables
  FOR SELECT
  USING (
    (visibility = 'PUBLIC' AND status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
    OR host_user_id = auth.uid()
    OR public.is_operator_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.game_table_players 
      WHERE table_id = game_tables.id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS p_tables_insert ON public.game_tables;
CREATE POLICY p_tables_insert ON public.game_tables
  FOR INSERT
  WITH CHECK (
    auth.uid() = host_user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND account_status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS p_tables_update ON public.game_tables;
CREATE POLICY p_tables_update ON public.game_tables
  FOR UPDATE
  USING (
    (host_user_id = auth.uid() AND status = 'OPEN')
    OR public.is_operator_or_above(auth.uid())
  )
  WITH CHECK (
    (host_user_id = auth.uid() AND status IN ('OPEN', 'CANCELLED'))
    OR public.is_operator_or_above(auth.uid())
  );

-- ================================================================
-- 9. Políticas RLS: game_table_players (Lectura pública controlada)
-- ================================================================
DROP POLICY IF EXISTS p_table_players_select ON public.game_table_players;
CREATE POLICY p_table_players_select ON public.game_table_players
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_operator_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.game_table_players p2 
      WHERE p2.table_id = game_table_players.table_id AND p2.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.game_tables t 
      WHERE t.id = game_table_players.table_id AND t.visibility = 'PUBLIC' AND t.status = 'OPEN'
    )
  );

-- ================================================================
-- 10. Políticas RLS: game_sessions (Estado Público)
-- ================================================================
DROP POLICY IF EXISTS p_sessions_select ON public.game_sessions;
CREATE POLICY p_sessions_select ON public.game_sessions
  FOR SELECT
  USING (
    public.is_operator_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.game_table_players p 
      WHERE p.table_id = game_sessions.table_id AND p.user_id = auth.uid()
    )
  );

-- ================================================================
-- 10.1 Políticas RLS: game_session_secrets (Secretos Ocultos)
-- ================================================================
DROP POLICY IF EXISTS p_session_secrets_admin ON public.game_session_secrets;
CREATE POLICY p_session_secrets_admin ON public.game_session_secrets
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ================================================================
-- 11. Políticas RLS: game_actions
-- ================================================================
DROP POLICY IF EXISTS p_actions_select ON public.game_actions;
CREATE POLICY p_actions_select ON public.game_actions
  FOR SELECT
  USING (
    public.is_operator_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.game_sessions s
      JOIN public.game_table_players p ON p.table_id = s.table_id
      WHERE s.id = game_actions.session_id AND p.user_id = auth.uid()
    )
  );

-- ================================================================
-- 12. Políticas RLS: game_settlements
-- ================================================================
DROP POLICY IF EXISTS p_settlements_select ON public.game_settlements;
CREATE POLICY p_settlements_select ON public.game_settlements
  FOR SELECT
  USING (
    public.is_operator_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.game_table_players p 
      WHERE p.table_id = game_settlements.table_id AND p.user_id = auth.uid()
    )
  );

-- ================================================================
-- 13. Políticas RLS: game_settlement_recipients
-- ================================================================
DROP POLICY IF EXISTS p_recipients_select ON public.game_settlement_recipients;
CREATE POLICY p_recipients_select ON public.game_settlement_recipients
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_operator_or_above(auth.uid())
  );

-- ================================================================
-- 14. Políticas RLS: kyc_verifications
-- ================================================================
DROP POLICY IF EXISTS p_kyc_select ON public.kyc_verifications;
CREATE POLICY p_kyc_select ON public.kyc_verifications
  FOR SELECT
  USING (
    user_id = auth.uid() 
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_kyc_insert ON public.kyc_verifications;
CREATE POLICY p_kyc_insert ON public.kyc_verifications
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND status = 'PENDING');

DROP POLICY IF EXISTS p_kyc_update ON public.kyc_verifications;
CREATE POLICY p_kyc_update ON public.kyc_verifications
  FOR UPDATE
  USING (public.is_operator_or_above(auth.uid()))
  WITH CHECK (public.is_operator_or_above(auth.uid()));

-- ================================================================
-- 15. Políticas RLS: audit_logs (Inmutable, Solo Admins)
-- ================================================================
DROP POLICY IF EXISTS p_audit_select ON public.audit_logs;
CREATE POLICY p_audit_select ON public.audit_logs
  FOR SELECT
  USING (public.is_admin(auth.uid()));

-- ================================================================
-- 16. Políticas RLS: system_settings
-- ================================================================
DROP POLICY IF EXISTS p_settings_select ON public.system_settings;
CREATE POLICY p_settings_select ON public.system_settings
  FOR SELECT
  USING (
    is_public = TRUE 
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_settings_update ON public.system_settings;
CREATE POLICY p_settings_update ON public.system_settings
  FOR UPDATE
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ================================================================
-- 17. Políticas RLS: support_tickets
-- ================================================================
DROP POLICY IF EXISTS p_support_select ON public.support_tickets;
CREATE POLICY p_support_select ON public.support_tickets
  FOR SELECT
  USING (
    user_id = auth.uid() 
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_support_insert ON public.support_tickets;
CREATE POLICY p_support_insert ON public.support_tickets
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p_support_update ON public.support_tickets;
CREATE POLICY p_support_update ON public.support_tickets
  FOR UPDATE
  USING (
    user_id = auth.uid() 
    OR public.is_operator_or_above(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid() 
    OR public.is_operator_or_above(auth.uid())
  );

-- ================================================================
-- 18. Políticas RLS: notifications
-- ================================================================
DROP POLICY IF EXISTS p_notifications_select ON public.notifications;
CREATE POLICY p_notifications_select ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS p_notifications_update ON public.notifications;
CREATE POLICY p_notifications_update ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
