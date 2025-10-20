import { useState } from 'react';
import OptionsDashboard from './components/OptionsDashboard';
import DarkPoolDashboard from './components/DarkPoolDashboard';
import TradePsychologyDashboard from './components/TradePsychologyDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

type DashboardType = 'options' | 'darkpool' | 'psychology';

function App() {
  const [activeDashboard, setActiveDashboard] = useState<DashboardType>('options');

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
          ) : (
            <TradePsychologyDashboard 
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
