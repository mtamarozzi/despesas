import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

// null = carregando, array = carregado (pode ser vazio)
export function useHouseholdMembers(householdId) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!householdId) return undefined;
    let cancelled = false;
    supabase
      .from('household_members')
      .select('user_id, profiles:profiles(id, display_name, email)')
      .eq('household_id', householdId)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setMembers([]);
          return;
        }
        const flat = (data ?? [])
          .map((row) => ({
            user_id: row.user_id,
            display_name:
              row.profiles?.display_name?.trim() || row.profiles?.email || 'Sem nome',
          }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name, 'pt-BR'));
        setError(null);
        setMembers(flat);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  return {
    members: members ?? [],
    loading: members === null,
    error,
  };
}
