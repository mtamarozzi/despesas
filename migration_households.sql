-- ============================================================
-- MIGRATION: Households (família compartilhada)
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- 1. Tabela de famílias
CREATE TABLE IF NOT EXISTS households (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Membros da família
CREATE TABLE IF NOT EXISTS household_members (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, user_id)
);

-- 3. Adicionar colunas na tabela expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS household_id  UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS added_by_name TEXT;

-- ============================================================
-- RLS: households
-- ============================================================
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode ler (necessário para validar código de convite)
CREATE POLICY "households_select" ON households
  FOR SELECT TO authenticated USING (true);

-- Apenas o criador pode inserir
CREATE POLICY "households_insert" ON households
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- ============================================================
-- RLS: household_members
-- ============================================================
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Membros podem ver quem está na sua família
CREATE POLICY "members_select" ON household_members
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- Usuário só pode inserir a si mesmo
CREATE POLICY "members_insert" ON household_members
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================
-- RLS: expenses — substituir política existente por household
-- ============================================================

-- Remove políticas antigas (ajuste os nomes se necessário)
DROP POLICY IF EXISTS "Users can manage own expenses"   ON expenses;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON expenses;
DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expenses_update" ON expenses;
DROP POLICY IF EXISTS "expenses_delete" ON expenses;

CREATE POLICY "expenses_select" ON expenses
  FOR SELECT TO authenticated USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT TO authenticated WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE TO authenticated USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE TO authenticated USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- Habilitar Realtime na tabela expenses
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
