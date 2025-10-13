import OptionsDashboard from './components/OptionsDashboard'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

function App() {
  return (
    <div className="app">
      <main>
        <ErrorBoundary>
          <OptionsDashboard />
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App
