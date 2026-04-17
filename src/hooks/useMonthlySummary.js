import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

// undefined = carregando, null = sem dados, obj = carregado
export function useMonthlySummary(householdId, monthYear) {
  const [summary, setSummary] = useState(undefined);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!householdId || !monthYear) return undefined;
    let cancelled = false;
    supabase
      .from('monthly_summary')
      .select('*')
      .eq('household_id', householdId)
      .eq('month_year', monthYear)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setSummary(null);
          return;
        }
        setError(null);
        setSummary(data ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId, monthYear, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  return {
    summary,
    loading: summary === undefined,
    error,
    reload,
  };
}

// Helper: primeiro dia do mês corrente em formato YYYY-MM-01
export function currentMonthYear() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}
