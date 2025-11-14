import React, { useEffect, useRef, useState } from 'react';

interface TradingViewChartProps {
  symbol: string;
  width?: string | number;
  height?: string | number;
  interval?: '1' | '5' | '15' | '30' | '60' | 'D' | 'W' | 'M';
  theme?: 'light' | 'dark';
  style?: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
  locale?: string;
  hide_top_toolbar?: boolean;
  hide_legend?: boolean;
  container_id?: string;
}

// Global script loading state
let tradingViewScriptLoaded = false;
let tradingViewScriptLoading = false;
const scriptLoadCallbacks: Array<() => void> = [];

/**
 * Load TradingView script once globally
 */
function loadTradingViewScript(callback: () => void) {
  if (tradingViewScriptLoaded) {
    callback();
    return;
  }

  if (tradingViewScriptLoading) {
    scriptLoadCallbacks.push(callback);
    return;
  }

  tradingViewScriptLoading = true;
  const script = document.createElement('script');
  script.src = 'https://s3.tradingview.com/tv.js';
  script.async = true;
  script.onload = () => {
    tradingViewScriptLoaded = true;
    tradingViewScriptLoading = false;
    callback();
    // Execute all pending callbacks
    scriptLoadCallbacks.forEach(cb => cb());
    scriptLoadCallbacks.length = 0;
  };
  script.onerror = () => {
    tradingViewScriptLoading = false;
    console.error('Failed to load TradingView script');
    // Execute callbacks with error state
    scriptLoadCallbacks.forEach(cb => cb());
    scriptLoadCallbacks.length = 0;
  };
  
  // Check if script already exists
  const existingScript = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]');
  if (existingScript) {
    tradingViewScriptLoaded = true;
    tradingViewScriptLoading = false;
    callback();
    scriptLoadCallbacks.forEach(cb => cb());
    scriptLoadCallbacks.length = 0;
    return;
  }
  
  // Append script to head
  try {
    document.head.appendChild(script);
  } catch (e) {
    console.error('Failed to append TradingView script:', e);
    tradingViewScriptLoading = false;
  }
}

/**
 * TradingView Chart Widget Component
 * 
 * This component embeds a TradingView chart widget using their free widget API.
 * 
 * @param symbol - Stock symbol (e.g., 'AAPL', 'TSLA', 'NVDA')
 * @param width - Chart width (default: '100%')
 * @param height - Chart height (default: 500)
 * @param interval - Time interval (default: 'D' for daily)
 * @param theme - Chart theme (default: 'dark')
 * @param style - Chart style (default: '1' for candlestick)
 * 
 * Usage:
 * <TradingViewChart symbol="AAPL" height={600} />
 */
const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  width = '100%',
  height = 500,
  interval = 'D',
  theme = 'dark',
  style = '1', // 1=Candlestick, 2=Line, 3=Area, 4=Renko, 5=Line Break, 6=Kagi, 7=Point & Figure, 8=Heikin Ashi, 9=Hollow Candles
  locale = 'en',
  hide_top_toolbar = false,
  hide_legend = false,
  container_id,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wrapperRef.current) return;

    // Create a completely isolated container that React never touches
    const uniqueId = container_id || `tradingview_${symbol}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create container div that React doesn't manage
    let container = document.getElementById(uniqueId);
    if (!container) {
      container = document.createElement('div');
      container.id = uniqueId;
      container.style.width = '100%';
      container.style.height = '100%';
      wrapperRef.current.appendChild(container);
      containerRef.current = container;
    }

    setIsLoading(true);
    setError(null);

    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    // Load script and initialize widget
    loadTradingViewScript(() => {
      if (!isMounted || !container) return;

      // Wait for TradingView to be available
      const checkAndInit = (attempts = 0) => {
        if (!isMounted || !container) return;
        
        if (typeof (window as any).TradingView === 'undefined') {
          if (attempts < 10) {
            timeoutId = setTimeout(() => checkAndInit(attempts + 1), 100);
          } else {
            if (isMounted) {
              setError('Failed to load TradingView chart');
              setIsLoading(false);
            }
          }
          return;
        }

        try {
          // Destroy previous widget if it exists
          if (widgetRef.current) {
            try {
              if (typeof widgetRef.current.remove === 'function') {
                widgetRef.current.remove();
              }
            } catch (e) {
              // Ignore - widget might already be destroyed
            }
            widgetRef.current = null;
          }

          if (!isMounted || !container) return;

          // Create new widget
          const widget = new (window as any).TradingView.widget({
            autosize: true,
            symbol: symbol,
            interval: interval,
            timezone: 'America/New_York',
            theme: theme,
            style: style,
            locale: locale,
            enable_publishing: false,
            allow_symbol_change: true,
            container_id: uniqueId,
            hide_top_toolbar: hide_top_toolbar,
            hide_legend: hide_legend,
            studies: [
              'Volume@tv-basicstudies'
            ],
            withdateranges: true,
            range: '1M',
            hide_volume: false,
            scalePosition: 'right',
            scaleMode: 'Normal',
            support_host: 'https://www.tradingview.com'
          });

          if (isMounted) {
            widgetRef.current = widget;
            setIsLoading(false);
          }
        } catch (error) {
          console.error('Error creating TradingView widget:', error);
          if (isMounted) {
            setError('Failed to initialize chart');
            setIsLoading(false);
          }
        }
      };

      checkAndInit();
    });

    // Cleanup function
    return () => {
      isMounted = false;
      
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Clean up widget
      if (widgetRef.current) {
        try {
          if (typeof widgetRef.current.remove === 'function') {
            widgetRef.current.remove();
          }
        } catch (e) {
          // Ignore cleanup errors
        }
        widgetRef.current = null;
      }
      
      // Remove the container from DOM safely using remove() method
      if (container) {
        try {
          // Use remove() which is safer - it checks if element is in DOM
          if (container.parentNode) {
            container.remove();
          }
        } catch (e) {
          // Ignore - might already be removed
        }
      }
      containerRef.current = null;
    };
  }, [
    symbol,
    interval,
    theme,
    style,
    locale,
    hide_top_toolbar,
    hide_legend,
    container_id,
  ]);

  return (
    <div
      key={`tv-wrapper-${symbol}`}
      ref={wrapperRef}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: typeof height === 'number' ? `${height}px` : `${height}`,
        position: 'relative',
      }}
      className="tradingview-widget-container"
    >
      {isLoading && !error && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#888',
            fontSize: '14px',
          }}
        >
          Loading chart...
        </div>
      )}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#ff6b6b',
            fontSize: '14px',
            textAlign: 'center',
            padding: '20px',
          }}
        >
          {error}
          <br />
          <button
            onClick={() => {
              setError(null);
              setIsLoading(true);
              // Force re-render by updating a dependency
              if (containerRef.current) {
                containerRef.current.innerHTML = '';
              }
            }}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default TradingViewChart;

