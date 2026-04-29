import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickData, LineData, UTCTimestamp, SeriesMarker, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { type MarketBar, type Signal } from '../lib/utils';

interface TradingViewChartProps {
  data: MarketBar[];
  signals: Signal[];
  chartType: 'CANDLESTICK' | 'HEIKIN_ASHI';
  activeSymbol: { id: string; name: string };
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({ data, signals, chartType, activeSymbol }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const srLinesRef = useRef<any[]>([]);
  const priceLinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
      },
      localization: {
        locale: 'en-IN',
        timeFormatter: (timestamp: number) => {
          const date = new Date(timestamp * 1000);
          return date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Kolkata'
          });
        },
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Kolkata'
          });
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      crosshair: {
        vertLine: {
          color: '#3b82f6',
          width: 1,
          style: 1,
          labelBackgroundColor: '#3b82f6',
        },
        horzLine: {
          color: '#3b82f6',
          width: 1,
          style: 1,
          labelBackgroundColor: '#3b82f6',
        },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    const ema9Series = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const ema20Series = chart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const vwapSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ema9SeriesRef.current = ema9Series;
    ema20SeriesRef.current = ema20Series;
    vwapSeriesRef.current = vwapSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [activeSymbol]);

  useEffect(() => {
    if (!candleSeriesRef.current || !ema9SeriesRef.current || !ema20SeriesRef.current || data.length === 0) return;

    const formattedData: CandlestickData[] = data.map(d => ({
      time: (d.timestamp.getTime() / 1000) as UTCTimestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const ema9Data: LineData[] = data
      .filter(d => d.ema9 !== undefined)
      .map(d => ({
        time: (d.timestamp.getTime() / 1000) as UTCTimestamp,
        value: d.ema9!,
      }));

    const ema20Data: LineData[] = data
      .filter(d => d.ema20 !== undefined)
      .map(d => ({
        time: (d.timestamp.getTime() / 1000) as UTCTimestamp,
        value: d.ema20!,
      }));

    const vwapData: LineData[] = data
      .filter(d => d.vwap !== undefined)
      .map(d => ({
        time: (d.timestamp.getTime() / 1000) as UTCTimestamp,
        value: d.vwap!,
      }));

    candleSeriesRef.current.setData(formattedData);
    ema9SeriesRef.current.setData(ema9Data);
    ema20SeriesRef.current.setData(ema20Data);
    if (vwapSeriesRef.current) vwapSeriesRef.current.setData(vwapData);

    // Add Markers for Signals
    const markers: SeriesMarker<UTCTimestamp>[] = signals.map(sig => ({
      time: (sig.timestamp.getTime() / 1000) as UTCTimestamp,
      position: sig.type === 'BUY' ? 'belowBar' : 'aboveBar',
      color: sig.type === 'BUY' ? '#10b981' : '#f43f5e',
      shape: sig.type === 'BUY' ? 'arrowUp' : 'arrowDown',
      text: sig.type,
      size: 2,
    }));

    if (candleSeriesRef.current) {
      const series = candleSeriesRef.current as any;
      
      // In v5, markers are still set via setMarkers, but we add extra checks
      if (typeof series.setMarkers === 'function') {
        series.setMarkers(markers);
      } else if (typeof series.applyOptions === 'function') {
        // Fallback for some versions/configurations
        series.applyOptions({ markers });
      } else {
        console.error('Neither setMarkers nor applyOptions found on series object:', Object.keys(series));
      }
    }

    // Manage Price Lines for active signal
    if (candleSeriesRef.current) {
      const series = candleSeriesRef.current as any;
      
      if (typeof series.removePriceLine === 'function') {
        priceLinesRef.current.forEach(line => series.removePriceLine(line));
        srLinesRef.current.forEach(line => series.removePriceLine(line));
      }
      priceLinesRef.current = [];
      srLinesRef.current = [];

      const latestBar = data[data.length - 1];

      // Draw Support and Resistance Lines
      if (latestBar && typeof series.createPriceLine === 'function') {
        if (latestBar.resistance) {
          const resLine = series.createPriceLine({
            price: latestBar.resistance,
            color: 'rgba(244, 63, 94, 0.4)',
            lineWidth: 1,
            lineStyle: 0, // Solid
            axisLabelVisible: true,
            title: 'RESISTANCE',
          });
          srLinesRef.current.push(resLine);
        }

        if (latestBar.support) {
          const supLine = series.createPriceLine({
            price: latestBar.support,
            color: 'rgba(16, 185, 129, 0.4)',
            lineWidth: 1,
            lineStyle: 0, // Solid
            axisLabelVisible: true,
            title: 'SUPPORT',
          });
          srLinesRef.current.push(supLine);
        }
      }

      const activeSignal = signals.find(s => s.timestamp.getTime() === latestBar?.timestamp.getTime());

      if (activeSignal && activeSignal.type !== 'NEUTRAL' && typeof series.createPriceLine === 'function') {
        const entryLine = series.createPriceLine({
          price: activeSignal.price,
          color: '#3b82f6',
          lineWidth: 2,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: 'ENTRY',
        });

        if (activeSignal.sl) {
          const slLine = series.createPriceLine({
            price: activeSignal.sl,
            color: '#f43f5e',
            lineWidth: 2,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'SL',
          });
          priceLinesRef.current.push(slLine);
        }

        if (activeSignal.tp) {
          const tpLine = series.createPriceLine({
            price: activeSignal.tp,
            color: '#10b981',
            lineWidth: 2,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'TP',
          });
          priceLinesRef.current.push(tpLine);
        }
        
        priceLinesRef.current.push(entryLine);
      }
    }

    // Fit content on first load or symbol change
    if (data.length > 0 && chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data, signals, chartType]);

  return (
    <div className="w-full h-full relative">
      <div ref={chartContainerRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="flex items-center gap-4 px-4 py-2 glass rounded-xl border border-border/50 shadow-2xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <span className="micro-label text-white/70">EMA 9</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
            <span className="micro-label text-white/70">EMA 20</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
            <span className="micro-label text-white/70">VWAP</span>
          </div>
        </div>
      </div>
    </div>
  );
};
