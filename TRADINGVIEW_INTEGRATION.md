# TradingView Chart Integration

This document explains how to use TradingView charts in the Options Analysis application.

## Overview

The application now includes a `TradingViewChart` component that embeds TradingView's free charting widget. This provides professional-grade stock charts with technical indicators, drawing tools, and real-time data.

## Component: TradingViewChart

**Location:** `src/components/TradingViewChart.tsx`

### Basic Usage

```tsx
import TradingViewChart from './components/TradingViewChart';

// Simple usage
<TradingViewChart symbol="AAPL" />

// With custom options
<TradingViewChart 
  symbol="TSLA"
  height={600}
  interval="D"
  theme="dark"
  style="1"
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `symbol` | `string` | **required** | Stock symbol (e.g., 'AAPL', 'TSLA', 'NVDA') |
| `width` | `string \| number` | `'100%'` | Chart width (e.g., '100%' or 800) |
| `height` | `string \| number` | `500` | Chart height in pixels |
| `interval` | `'1' \| '5' \| '15' \| '30' \| '60' \| 'D' \| 'W' \| 'M'` | `'D'` | Time interval |
| `theme` | `'light' \| 'dark'` | `'dark'` | Chart theme |
| `style` | `'1' \| '2' \| ... \| '9'` | `'1'` | Chart style (1=Candlestick, 2=Line, etc.) |
| `locale` | `string` | `'en'` | Language locale |
| `hide_top_toolbar` | `boolean` | `false` | Hide top toolbar |
| `hide_legend` | `boolean` | `false` | Hide legend |
| `save_image` | `boolean` | `false` | Enable save image feature |

### Chart Styles

- `'1'` - Candlestick (default)
- `'2'` - Line
- `'3'` - Area
- `'4'` - Renko
- `'5'` - Line Break
- `'6'` - Kagi
- `'7'` - Point & Figure
- `'8'` - Heikin Ashi
- `'9'` - Hollow Candles

### Time Intervals

- `'1'`, `'5'`, `'15'`, `'30'`, `'60'` - Minutes
- `'D'` - Daily (default)
- `'W'` - Weekly
- `'M'` - Monthly

## Integration Examples

### Example 1: Basic Chart in Dashboard

```tsx
import TradingViewChart from './components/TradingViewChart';

function MyComponent() {
  const [selectedTicker, setSelectedTicker] = useState('AAPL');
  
  return (
    <div>
      <h2>Stock Chart</h2>
      <TradingViewChart symbol={selectedTicker} height={500} />
    </div>
  );
}
```

### Example 2: Multiple Charts with Different Styles

```tsx
<div className="charts-grid">
  <div>
    <h3>Candlestick Chart</h3>
    <TradingViewChart symbol="TSLA" style="1" height={400} />
  </div>
  <div>
    <h3>Line Chart</h3>
    <TradingViewChart symbol="TSLA" style="2" height={400} />
  </div>
  <div>
    <h3>Heikin Ashi</h3>
    <TradingViewChart symbol="TSLA" style="8" height={400} />
  </div>
</div>
```

### Example 3: Intraday Chart

```tsx
<TradingViewChart 
  symbol="NVDA"
  interval="15"  // 15-minute intervals
  height={600}
/>
```

### Example 4: Light Theme Chart

```tsx
<TradingViewChart 
  symbol="AAPL"
  theme="light"
  height={500}
/>
```

## Current Integration

The TradingView chart is currently integrated into the `OptionsDashboard` component. It automatically displays when a ticker is selected, showing the price chart above the options volume charts.

**Location in code:** `src/components/OptionsDashboard.tsx` (around line 463)

## Features

The TradingView widget includes:

- ✅ Real-time or delayed price data (depending on data source)
- ✅ Multiple chart types (candlestick, line, area, etc.)
- ✅ Technical indicators (Volume, Moving Averages, RSI, etc.)
- ✅ Drawing tools (trend lines, shapes, annotations)
- ✅ Time range selection (1D, 5D, 1M, 3M, 1Y, etc.)
- ✅ Multiple timeframes (1min, 5min, 15min, 1H, 1D, etc.)
- ✅ Symbol search and switching
- ✅ Responsive design

## Limitations

1. **Free Widget**: This uses TradingView's free widget, which has some limitations:
   - Data may be delayed (15-20 minutes for free users)
   - Some advanced features require a TradingView account
   - Limited customization compared to the paid Charting Library

2. **Commercial Use**: For commercial applications, you may need:
   - TradingView Charting Library license (paid)
   - Or ensure compliance with TradingView's terms of service

3. **Data Source**: The widget uses TradingView's data feed. For real-time data, you may need to integrate your own data provider.

## Advanced: TradingView Charting Library

For more advanced features and customization, you can upgrade to TradingView's Charting Library:

- **Cost**: Requires a license (contact TradingView for pricing)
- **Features**: 
  - Full customization
  - Custom indicators
  - Real-time data integration
  - Advanced drawing tools
  - Custom UI elements

**Documentation**: https://www.tradingview.com/charting-library/

## Troubleshooting

### Chart Not Loading

1. Check browser console for errors
2. Ensure internet connection (requires TradingView CDN)
3. Verify symbol is valid (e.g., 'AAPL' not 'AAPL.US')
4. Check if ad blockers are interfering

### Chart Too Small/Large

Adjust the `height` prop:
```tsx
<TradingViewChart symbol="AAPL" height={800} />
```

### Wrong Timezone

The component uses `America/New_York` timezone by default. To change:
- Modify the `timezone` property in the component (requires editing the component)

## Resources

- [TradingView Widget Documentation](https://www.tradingview.com/widget-docs/)
- [TradingView Charting Library](https://www.tradingview.com/charting-library/)
- [TradingView Widget Gallery](https://www.tradingview.com/widget/)

