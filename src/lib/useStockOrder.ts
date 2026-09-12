import { useState } from 'react';
import { loadStockOrder, saveStockOrder } from './stock.layout';
import { useAsyncData } from './useAsyncData';

export function useStockOrder() {
  const { data, loading, error, reload } = useAsyncData(loadStockOrder, [] as string[]);
  const [saved, setSaved] = useState<string[] | null>(null);
  async function save(order: string[]) {
    await saveStockOrder(order);
    setSaved(order);
  }
  return { order: saved ?? data, loading, error, reload, save };
}
