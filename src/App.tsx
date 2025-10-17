import { useState } from 'react';
import OptionsDashboard from './components/OptionsDashboard';
import DarkPoolDashboard from './components/DarkPoolDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

type DashboardType = 'options' | 'darkpool';

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
          ) : (
            <DarkPoolDashboard 
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
