import React, { useMemo } from 'react';
import { OptionData } from '../utils/dataParser';
import { StockDirectionPrediction } from '../utils/tradePsychology';

interface TickerDirectionChartsProps {
  trades: OptionData[];
  prediction: StockDirectionPrediction;
}

const TickerDirectionCharts: React.FC<TickerDirectionChartsProps> = ({ trades, prediction }) => {
  // Calculate chart data
  const chartData = useMemo(() => {
    const callVolume = trades
      .filter(t => t.optionType === 'Call')
      .reduce((sum, t) => sum + t.volume, 0);
    
    const putVolume = trades
      .filter(t => t.optionType === 'Put')
      .reduce((sum, t) => sum + t.volume, 0);

    const callPremium = trades
      .filter(t => t.optionType === 'Call')
      .reduce((sum, t) => {
        const premium = t.premium.replace(/[$,K]/g, '');
        const num = parseFloat(premium);
        return sum + (t.premium.includes('K') ? num * 1000 : num || 0);
      }, 0);

    const putPremium = trades
      .filter(t => t.optionType === 'Put')
      .reduce((sum, t) => {
        const premium = t.premium.replace(/[$,K]/g, '');
        const num = parseFloat(premium);
        return sum + (t.premium.includes('K') ? num * 1000 : num || 0);
      }, 0);

    const maxVolume = Math.max(callVolume, putVolume, 1);
    const maxPremium = Math.max(callPremium, putPremium, 1);

    return {
      callVolume,
      putVolume,
      callPremium,
      putPremium,
      maxVolume,
      maxPremium,
      callPutRatio: putVolume > 0 ? callVolume / putVolume : callVolume > 0 ? 999 : 0
    };
  }, [trades]);

  const formatVolume = (volume: number): string => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toString();
  };

  const formatPremium = (premium: number): string => {
    if (premium >= 1000000) {
      return `$${(premium / 1000000).toFixed(1)}M`;
    } else if (premium >= 1000) {
      return `$${(premium / 1000).toFixed(1)}K`;
    }
    return `$${premium.toFixed(0)}`;
  };

  return (
    <div className="ticker-direction-charts">
      {/* Call/Put Volume Comparison */}
      <div className="ticker-chart-container">
        <div className="ticker-chart-header">
          <span className="ticker-chart-title">Call/Put Volume</span>
          <span className="ticker-chart-ratio">
            {chartData.callPutRatio.toFixed(2)}:1
          </span>
        </div>
        <div className="ticker-chart-bars">
          <div className="ticker-chart-bar-group">
            <div 
              className="ticker-chart-bar call-bar"
              style={{ 
                height: `${(chartData.callVolume / chartData.maxVolume) * 100}%`,
                minHeight: chartData.callVolume > 0 ? '4px' : '0'
              }}
              title={`Call Volume: ${formatVolume(chartData.callVolume)}`}
            >
              <span className="ticker-bar-value">{formatVolume(chartData.callVolume)}</span>
            </div>
            <div className="ticker-bar-label">Call</div>
          </div>
          <div className="ticker-chart-bar-group">
            <div 
              className="ticker-chart-bar put-bar"
              style={{ 
                height: `${(chartData.putVolume / chartData.maxVolume) * 100}%`,
                minHeight: chartData.putVolume > 0 ? '4px' : '0'
              }}
              title={`Put Volume: ${formatVolume(chartData.putVolume)}`}
            >
              <span className="ticker-bar-value">{formatVolume(chartData.putVolume)}</span>
            </div>
            <div className="ticker-bar-label">Put</div>
          </div>
        </div>
      </div>

      {/* Premium Flow */}
      <div className="ticker-chart-container">
        <div className="ticker-chart-header">
          <span className="ticker-chart-title">Premium Flow</span>
          <span className={`ticker-chart-ratio ${prediction.keyMetrics.premiumFlow > 0 ? 'positive' : 'negative'}`}>
            {(prediction.keyMetrics.premiumFlow * 100).toFixed(1)}%
          </span>
        </div>
        <div className="ticker-chart-bars">
          <div className="ticker-chart-bar-group">
            <div 
              className="ticker-chart-bar call-bar"
              style={{ 
                height: `${(chartData.callPremium / chartData.maxPremium) * 100}%`,
                minHeight: chartData.callPremium > 0 ? '4px' : '0'
              }}
              title={`Call Premium: ${formatPremium(chartData.callPremium)}`}
            >
              <span className="ticker-bar-value">{formatPremium(chartData.callPremium)}</span>
            </div>
            <div className="ticker-bar-label">Call</div>
          </div>
          <div className="ticker-chart-bar-group">
            <div 
              className="ticker-chart-bar put-bar"
              style={{ 
                height: `${(chartData.putPremium / chartData.maxPremium) * 100}%`,
                minHeight: chartData.putPremium > 0 ? '4px' : '0'
              }}
              title={`Put Premium: ${formatPremium(chartData.putPremium)}`}
            >
              <span className="ticker-bar-value">{formatPremium(chartData.putPremium)}</span>
            </div>
            <div className="ticker-bar-label">Put</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TickerDirectionCharts;








