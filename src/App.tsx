import React from 'react'
import OptionsDashboard from './components/OptionsDashboard'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Option Analysis Dashboard</h1>
        <p>Real-time options trading analytics and insights</p>
      </header>
      
      <main>
        <OptionsDashboard />
      </main>
    </div>
  )
}

export default App
