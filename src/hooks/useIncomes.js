import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

// null = carregando, array = carregado
export function useIncomes(householdId, filters) {
  const [incomes, setIncomes] = useState(null);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const { startDate, endDate, categoryId, status, userId } = filters || {};

  useEffect(() => {
    if (!householdId) return undefined;
    let cancelled = false;
    let q = supabase
      .from('incomes')
      .select(
        'id, name, amount, received_date, status, notes, user_id, category_id, added_by_name, recurrence_id, created_at, updated_at, categories:categories(id, name, icon, color)',
      )
      .eq('household_id', householdId)
      .order('received_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (startDate) q = q.gte('received_date', startDate);
    if (endDate) q = q.lte('received_date', endDate);
    if (categoryId) q = q.eq('category_id', categoryId);
    if (status) q = q.eq('status', status);
    if (userId) q = q.eq('user_id', userId);

    q.then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setIncomes([]);
        return;
      }
      setError(null);
      setIncomes(data ?? []);
    });

    return () => {
      cancelled = true;
    };
  }, [householdId, startDate, endDate, categoryId, status, userId, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const create = useCallback(
    async (input) => {
      const payload = {
        household_id: householdId,
        user_id: input.user_id,
        name: input.name.trim(),
        amount: Number(input.amount),
        category_id: input.category_id || null,
        received_date: input.received_date,
        status: input.status || 'recebido',
        notes: input.notes?.trim() || null,
        added_by_name: input.added_by_name,
        recurrence_id: null,
      };
      const { data, error: err } = await supabase
        .from('incomes')
        .insert(payload)
        .select(
          'id, name, amount, received_date, status, notes, user_id, category_id, added_by_name, recurrence_id, created_at, updated_at, categories:categories(id, name, icon, color)',
        )
        .single();
      if (err) throw err;
      setIncomes((prev) => [data, ...(prev ?? [])]);
      return data;
    },
    [householdId],
  );

  const update = useCallback(async (id, patch) => {
    const payload = {};
    if (patch.name !== undefined) payload.name = patch.name.trim();
    if (patch.amount !== undefined) payload.amount = Number(patch.amount);
    if (patch.category_id !== undefined) payload.category_id = patch.category_id || null;
    if (patch.received_date !== undefined) payload.received_date = patch.received_date;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;
    if (patch.user_id !== undefined) payload.user_id = patch.user_id;

    const { data, error: err } = await supabase
      .from('incomes')
      .update(payload)
      .eq('id', id)
      .select(
        'id, name, amount, received_date, status, notes, user_id, category_id, added_by_name, recurrence_id, created_at, updated_at, categories:categories(id, name, icon, color)',
      )
      .single();
    if (err) throw err;
    setIncomes((prev) => (prev ?? []).map((r) => (r.id === id ? data : r)));
    return data;
  }, []);

  const remove = useCallback(async (id) => {
    const { error: err } = await supabase.from('incomes').delete().eq('id', id);
    if (err) throw err;
    setIncomes((prev) => (prev ?? []).filter((r) => r.id !== id));
  }, []);

  const markReceived = useCallback(
    async (id, receivedDate) => {
      return update(id, {
        status: 'recebido',
        received_date: receivedDate || new Date().toISOString().slice(0, 10),
      });
    },
    [update],
  );

  return {
    incomes: incomes ?? [],
    loading: incomes === null,
    error,
    reload,
    create,
    update,
    remove,
    markReceived,
  };
}
