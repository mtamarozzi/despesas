import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

// undefined = ainda carregando, null = nenhum profile, obj = carregado
export function useProfile(userId) {
  const [profile, setProfile] = useState(undefined);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, email, display_name, avatar_url, income_type, onboarding_completed, income_setup_skipped')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setError(null);
        setProfile(data ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const save = useCallback(async (patch) => {
    if (!userId) return undefined;
    const payload = {};
    if (patch.display_name !== undefined) payload.display_name = patch.display_name?.trim() || null;
    if (patch.avatar_url !== undefined) payload.avatar_url = patch.avatar_url?.trim() || null;
    if (patch.income_type !== undefined) payload.income_type = patch.income_type;
    if (patch.onboarding_completed !== undefined) payload.onboarding_completed = patch.onboarding_completed;
    if (patch.income_setup_skipped !== undefined) payload.income_setup_skipped = patch.income_setup_skipped;

    const { data, error: err } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select()
      .single();
    if (err) throw err;
    setProfile(data);
    return data;
  }, [userId]);

  return {
    profile,
    loading: profile === undefined,
    error,
    reload,
    save,
  };
}
