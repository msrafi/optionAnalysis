import { useState } from 'react';
import OptionsDashboard from './components/OptionsDashboard';
import DarkPoolDashboard from './components/DarkPoolDashboard';
import OverallAnalysisDashboard from './components/OverallAnalysisDashboard';
import YahooOptionsDashboard from './components/YahooOptionsDashboard';
import MostActiveOptionsInsightDashboard from './components/MostActiveOptionsInsightDashboard';
import OptionChainStructureDashboard from './components/OptionChainStructureDashboard';
import YahooChainStructureDashboard from './components/YahooChainStructureDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

type DashboardType = 'options' | 'darkpool' | 'psychology' | 'yahoo' | 'activeInsights' | 'chainStructure' | 'chainStructureYahoo';

function App() {
  const [activeDashboard, setActiveDashboard] = useState<DashboardType>('chainStructureYahoo');

  return (
    <div className="app">
      <main>
        <ErrorBoundary>
          {activeDashboard === 'options' ? (
            <OptionsDashboard 
              activeDashboard={activeDashboard}
              setActiveDashboard={setActiveDashboard}
            />
          ) : activeDashboard === 'darkpool' ? (
            <DarkPoolDashboard 
              activeDashboard={activeDashboard}
              setActiveDashboard={setActiveDashboard}
            />
          ) : activeDashboard === 'yahoo' ? (
            <YahooOptionsDashboard
              activeDashboard={activeDashboard}
              setActiveDashboard={setActiveDashboard}
            />
          ) : activeDashboard === 'activeInsights' ? (
            <MostActiveOptionsInsightDashboard
              activeDashboard={activeDashboard}
              setActiveDashboard={setActiveDashboard}
            />
          ) : activeDashboard === 'chainStructure' ? (
            <OptionChainStructureDashboard
              activeDashboard={activeDashboard}
              setActiveDashboard={setActiveDashboard}
            />
          ) : activeDashboard === 'chainStructureYahoo' ? (
            <YahooChainStructureDashboard
              activeDashboard={activeDashboard}
              setActiveDashboard={setActiveDashboard}
            />
          ) : (
            <OverallAnalysisDashboard 
              activeDashboard={activeDashboard}
              setActiveDashboard={setActiveDashboard}
            />
          )}
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App
