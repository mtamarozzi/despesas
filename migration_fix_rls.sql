-- ============================================================
-- FIX: Corrige recursão infinita nas políticas RLS
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- 1. Remove a política recursiva de household_members
DROP POLICY IF EXISTS "members_select" ON household_members;

-- 2. Recria sem auto-referência (usuário vê apenas sua própria linha)
CREATE POLICY "members_select" ON household_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 3. Remove e recria as políticas de expenses usando função SECURITY DEFINER
--    para evitar que o check do RLS de expenses dispare o RLS de household_members
DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expenses_update" ON expenses;
DROP POLICY IF EXISTS "expenses_delete" ON expenses;

-- Função auxiliar que roda fora do RLS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_my_household_ids()
RETURNS SETOF UUID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM household_members WHERE user_id = auth.uid();
$$;

-- Recria políticas usando a função auxiliar
CREATE POLICY "expenses_select" ON expenses
  FOR SELECT TO authenticated
  USING (household_id IN (SELECT get_my_household_ids()));

CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (household_id IN (SELECT get_my_household_ids()));

CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE TO authenticated
  USING (household_id IN (SELECT get_my_household_ids()));

CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE TO authenticated
  USING (household_id IN (SELECT get_my_household_ids()));
