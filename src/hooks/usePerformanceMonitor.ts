import { useEffect, useRef } from 'react';

interface PerformanceMetrics {
  renderTime: number;
  memoryUsage?: number;
  componentName: string;
}

export function usePerformanceMonitor(componentName: string) {
  const renderStartTime = useRef<number>(0);
  const renderCount = useRef<number>(0);

  useEffect(() => {
    renderStartTime.current = performance.now();
    renderCount.current += 1;

    return () => {
      const renderTime = performance.now() - renderStartTime.current;
      
      // Log performance metrics in development
      if (process.env.NODE_ENV === 'development') {
        const metrics: PerformanceMetrics = {
          renderTime,
          componentName,
          memoryUsage: (performance as any).memory?.usedJSHeapSize
        };
        
        console.log(`Performance: ${componentName}`, metrics);
        
        // Warn about slow renders
        if (renderTime > 16) { // 60fps threshold
          console.warn(`Slow render detected: ${componentName} took ${renderTime.toFixed(2)}ms`);
        }
      }
    };
  });
}

export function measureFunction<T extends (...args: any[]) => any>(
  fn: T,
  name: string
): T {
  return ((...args: any[]) => {
    const start = performance.now();
    const result = fn(...args);
    const end = performance.now();
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Function ${name} took ${(end - start).toFixed(2)}ms`);
    }
    
    return result;
  }) as T;
}
