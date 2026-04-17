import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

// null = ainda carregando, array = carregado (pode ser vazio)
export function useCategories(householdId) {
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!householdId) return undefined;
    let cancelled = false;
    supabase
      .from('categories')
      .select('id, name, icon, color, display_order, type, active, created_at, updated_at')
      .eq('household_id', householdId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setCategories([]);
        } else {
          setError(null);
          setCategories(data ?? []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [householdId, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const create = useCallback(async (input) => {
    const payload = {
      household_id: householdId,
      name: input.name.trim(),
      icon: input.icon?.trim() || null,
      color: input.color?.trim() || null,
      display_order: Number.isFinite(Number(input.display_order))
        ? Number(input.display_order)
        : 0,
      type: input.type ?? 'expense',
      active: input.active ?? true,
    };
    const { data, error: err } = await supabase
      .from('categories')
      .insert(payload)
      .select()
      .single();
    if (err) throw translateCategoryError(err, payload.name);
    setCategories((prev) => [...(prev ?? []), data].sort(sortCats));
    return data;
  }, [householdId]);

  const update = useCallback(async (id, patch) => {
    const payload = {};
    if (patch.name !== undefined) payload.name = patch.name.trim();
    if (patch.icon !== undefined) payload.icon = patch.icon?.trim() || null;
    if (patch.color !== undefined) payload.color = patch.color?.trim() || null;
    if (patch.display_order !== undefined) {
      payload.display_order = Number.isFinite(Number(patch.display_order))
        ? Number(patch.display_order)
        : 0;
    }
    if (patch.type !== undefined) payload.type = patch.type;
    if (patch.active !== undefined) payload.active = patch.active;

    const { data, error: err } = await supabase
      .from('categories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (err) throw translateCategoryError(err, payload.name);
    setCategories((prev) => (prev ?? []).map((c) => (c.id === id ? data : c)).sort(sortCats));
    return data;
  }, []);

  const remove = useCallback(async (id) => {
    const { error: err } = await supabase.from('categories').delete().eq('id', id);
    if (err) throw err;
    setCategories((prev) => (prev ?? []).filter((c) => c.id !== id));
  }, []);

  const toggleActive = useCallback(async (id) => {
    let nextActive = null;
    setCategories((prev) => {
      const target = (prev ?? []).find((c) => c.id === id);
      if (target) nextActive = !target.active;
      return prev;
    });
    if (nextActive === null) return undefined;
    return update(id, { active: nextActive });
  }, [update]);

  return {
    categories: categories ?? [],
    loading: categories === null,
    error,
    reload,
    create,
    update,
    remove,
    toggleActive,
  };
}

function sortCats(a, b) {
  if (a.display_order !== b.display_order) return a.display_order - b.display_order;
  return a.name.localeCompare(b.name, 'pt-BR');
}

function translateCategoryError(err, name) {
  if (err?.code === '23505') {
    const nice = new Error(
      name
        ? `Já existe uma categoria chamada "${name}" neste household.`
        : 'Já existe uma categoria com esse nome.',
    );
    nice.code = err.code;
    return nice;
  }
  return err;
}
