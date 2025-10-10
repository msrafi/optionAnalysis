import { useState, useEffect, useCallback } from 'react';

interface LazyDataOptions {
  batchSize?: number;
  delay?: number;
}

export function useLazyData<T>(
  data: T[],
  options: LazyDataOptions = {}
) {
  const { batchSize = 50, delay = 100 } = options;
  const [loadedData, setLoadedData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    
    setTimeout(() => {
      const currentLength = loadedData.length;
      const nextBatch = data.slice(currentLength, currentLength + batchSize);
      
      setLoadedData(prev => [...prev, ...nextBatch]);
      setHasMore(currentLength + batchSize < data.length);
      setIsLoading(false);
    }, delay);
  }, [data, loadedData.length, batchSize, delay, isLoading, hasMore]);

  const reset = useCallback(() => {
    setLoadedData([]);
    setHasMore(true);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (data.length > 0 && loadedData.length === 0) {
      loadMore();
    }
  }, [data, loadedData.length, loadMore]);

  return {
    loadedData,
    isLoading,
    hasMore,
    loadMore,
    reset
  };
}
