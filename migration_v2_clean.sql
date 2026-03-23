-- ============================================================
-- MIGRATION V2: Solução definitiva de família compartilhada
-- ATENÇÃO: Execute este arquivo completo no SQL Editor do Supabase
-- ============================================================

-- 1. Remove objetos antigos
DROP FUNCTION IF EXISTS get_my_household_ids();
DROP TABLE IF EXISTS household_members CASCADE;
DROP TABLE IF EXISTS households CASCADE;

-- 2. Recria tabela de famílias
CREATE TABLE households (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Recria tabela de membros
CREATE TABLE household_members (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, user_id)
);

-- 4. Garante colunas na tabela expenses e limpa IDs inválidos
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS household_id  UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS added_by_name TEXT;

-- Limpa household_ids antigos (inválidos, pois a tabela foi recriada)
UPDATE expenses SET household_id = NULL;

-- ============================================================
-- RLS: households (simples, sem recursão)
-- ============================================================
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "households_read"   ON households;
DROP POLICY IF EXISTS "households_insert" ON households;
DROP POLICY IF EXISTS "households_select" ON households;

-- Qualquer autenticado pode ler (para validar código de convite)
CREATE POLICY "households_read" ON households
  FOR SELECT TO authenticated USING (true);

-- Apenas o criador pode inserir
CREATE POLICY "households_insert" ON households
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- ============================================================
-- RLS: household_members (simples)
-- ============================================================
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read"   ON household_members;
DROP POLICY IF EXISTS "members_insert" ON household_members;
DROP POLICY IF EXISTS "members_select" ON household_members;

-- Usuário vê apenas sua própria linha
CREATE POLICY "members_read" ON household_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Usuário só insere a si mesmo
CREATE POLICY "members_insert" ON household_members
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================
-- RLS: expenses — usa JWT user_metadata (SEM join em tabelas)
-- Isso elimina qualquer possibilidade de recursão
-- ============================================================
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expenses_update" ON expenses;
DROP POLICY IF EXISTS "expenses_delete" ON expenses;
DROP POLICY IF EXISTS "Users can manage own expenses"      ON expenses;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON expenses;

CREATE POLICY "expenses_select" ON expenses
  FOR SELECT TO authenticated
  USING (
    household_id = ((auth.jwt() -> 'user_metadata') ->> 'household_id')::uuid
  );

CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    household_id = ((auth.jwt() -> 'user_metadata') ->> 'household_id')::uuid
  );

CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE TO authenticated
  USING (
    household_id = ((auth.jwt() -> 'user_metadata') ->> 'household_id')::uuid
  );

CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE TO authenticated
  USING (
    household_id = ((auth.jwt() -> 'user_metadata') ->> 'household_id')::uuid
  );

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
