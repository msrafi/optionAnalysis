import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Calendar, Filter } from 'lucide-react';
import TickerList from './TickerList';
import VolumeProfileChart from './VolumeProfileChart';
import { 
  parseCSVData, 
  getTickerSummaries, 
  getVolumeProfileForTicker, 
  getExpiryDatesForTicker,
  getHighestVolumeData,
  OptionData,
  TickerSummary,
  VolumeProfileData,
  HighestVolumeData
} from '../utils/dataParser';

// We'll load the CSV data via fetch instead of import

const OptionsDashboard: React.FC = () => {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
  const [optionData, setOptionData] = useState<OptionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCSVData = async () => {
      try {
        const response = await fetch('/discord.csv');
        const csvText = await response.text();
        const parsedData = parseCSVData(csvText);
        setOptionData(parsedData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading CSV data:', error);
        setLoading(false);
      }
    };

    loadCSVData();
  }, []);

  const tickerSummaries = useMemo(() => {
    return getTickerSummaries(optionData);
  }, [optionData]);

  const expiryDates = useMemo(() => {
    if (!selectedTicker) return [];
    return getExpiryDatesForTicker(optionData, selectedTicker);
  }, [optionData, selectedTicker]);

  const volumeProfileData = useMemo(() => {
    if (!selectedTicker) return [];
    return getVolumeProfileForTicker(optionData, selectedTicker, selectedExpiry || undefined);
  }, [optionData, selectedTicker, selectedExpiry]);

  const highestVolumeData = useMemo(() => {
    if (!selectedTicker) return null;
    return getHighestVolumeData(optionData, selectedTicker, selectedExpiry || undefined);
  }, [optionData, selectedTicker, selectedExpiry]);

  const handleTickerSelect = (ticker: string) => {
    setSelectedTicker(ticker);
    setSelectedExpiry(null); // Reset expiry selection when changing ticker
  };

  const handleBackToList = () => {
    setSelectedTicker(null);
    setSelectedExpiry(null);
  };

  const handleExpirySelect = (expiry: string) => {
    setSelectedExpiry(expiry === selectedExpiry ? null : expiry);
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading options data...</p>
      </div>
    );
  }

  return (
    <div className="options-dashboard">
      {!selectedTicker ? (
        <TickerList 
          tickers={tickerSummaries} 
          onTickerSelect={handleTickerSelect} 
        />
      ) : (
        <div className="ticker-detail-view">
          <div className="detail-header">
            <button className="back-button" onClick={handleBackToList}>
              <ArrowLeft className="back-icon" />
              Back to Ticker List
            </button>
            <h2>{selectedTicker} Options Analysis</h2>
          </div>

          {/* Expiry Date Filter */}
          <div className="expiry-filter">
            <div className="filter-header">
              <Calendar className="filter-icon" />
              <span>Filter by Expiry Date:</span>
            </div>
            <div className="expiry-buttons">
              <button 
                className={`expiry-button ${!selectedExpiry ? 'active' : ''}`}
                onClick={() => setSelectedExpiry(null)}
              >
                All Expiries
              </button>
              {expiryDates.map((expiry) => (
                <button
                  key={expiry}
                  className={`expiry-button ${selectedExpiry === expiry ? 'active' : ''}`}
                  onClick={() => handleExpirySelect(expiry)}
                >
                  {new Date(expiry).toLocaleDateString()}
                </button>
              ))}
            </div>
          </div>

          {/* Charts Section - Two Column Layout */}
          <div className="charts-section">
            {/* Left Column - Call/Put Volume Chart */}
            <div className="chart-column">
              <VolumeProfileChart 
                data={volumeProfileData}
                highestVolumeData={highestVolumeData}
                ticker={selectedTicker}
                expiry={selectedExpiry || undefined}
                chartType="callput"
              />
            </div>
            
            {/* Right Column - Total Volume Chart */}
            <div className="chart-column">
              <VolumeProfileChart 
                data={volumeProfileData}
                highestVolumeData={highestVolumeData}
                ticker={selectedTicker}
                expiry={selectedExpiry || undefined}
                chartType="total"
              />
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="summary-stats">
            <div className="stat-card">
              <h4>Total Volume</h4>
              <p>{volumeProfileData.reduce((sum, item) => sum + item.totalVolume, 0).toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <h4>Call Volume</h4>
              <p>{volumeProfileData.reduce((sum, item) => sum + item.callVolume, 0).toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <h4>Put Volume</h4>
              <p>{volumeProfileData.reduce((sum, item) => sum + item.putVolume, 0).toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <h4>Open Interest</h4>
              <p>{volumeProfileData.reduce((sum, item) => sum + item.openInterest, 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OptionsDashboard;
