import React from 'react'
import { BarChart3, TrendingUp, PieChart, Activity } from 'lucide-react'

interface MetricCardProps {
  title: string
  icon: React.ReactNode
  metrics: Array<{
    label: string
    value: string | number
    type?: 'positive' | 'negative' | 'neutral'
  }>
}

const MetricCard: React.FC<MetricCardProps> = ({ title, icon, metrics }) => (
  <div className="card overview-card">
    <div className="card-header">
      {icon}
      <h3>{title}</h3>
    </div>
    <div className="card-content">
      {metrics.map((metric, index) => (
        <div key={index} className="metric">
          <span className="metric-label">{metric.label}</span>
          <span className={`metric-value ${metric.type || 'neutral'}`}>
            {metric.value}
          </span>
        </div>
      ))}
    </div>
  </div>
)

interface ChartCardProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}

const ChartCard: React.FC<ChartCardProps> = ({ title, icon, children }) => (
  <div className="card chart-card">
    <div className="card-header">
      {icon}
      <h3>{title}</h3>
    </div>
    <div className="card-content">
      {children}
    </div>
  </div>
)

const Dashboard: React.FC = () => {
  const portfolioMetrics = [
    { label: 'Total Value', value: '$125,430', type: 'neutral' as const },
    { label: "Today's P&L", value: '+$2,340', type: 'positive' as const }
  ]

  const positionMetrics = [
    { label: 'Open Positions', value: '12', type: 'neutral' as const },
    { label: 'Expiring Today', value: '3', type: 'neutral' as const }
  ]

  return (
    <div className="dashboard">
      <div className="dashboard-grid">
        <MetricCard
          title="Portfolio Overview"
          icon={<TrendingUp className="card-icon" />}
          metrics={portfolioMetrics}
        />
        
        <MetricCard
          title="Active Positions"
          icon={<Activity className="card-icon" />}
          metrics={positionMetrics}
        />

        <ChartCard
          title="P&L Trend"
          icon={<BarChart3 className="card-icon" />}
        >
          <div className="chart-placeholder">
            <p>Chart will be implemented here</p>
          </div>
        </ChartCard>

        <ChartCard
          title="Position Distribution"
          icon={<PieChart className="card-icon" />}
        >
          <div className="chart-placeholder">
            <p>Pie chart will be implemented here</p>
          </div>
        </ChartCard>

        <div className="card table-card">
          <div className="card-header">
            <h3>Options Chain</h3>
          </div>
          <div className="card-content">
            <div className="table-placeholder">
              <p>Options chain table will be implemented here</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
