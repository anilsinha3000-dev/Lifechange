import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  if (data.length === 0) return [];
  let prevEma = data[0];
  ema.push(prevEma);

  for (let i = 1; i < data.length; i++) {
    const currentEma = data[i] * k + prevEma * (1 - k);
    ema.push(currentEma);
    prevEma = currentEma;
  }
  return ema;
}

export function calculateATR(bars: MarketBar[], period: number = 14): number[] {
  if (bars.length < period) return bars.map(() => 0);
  
  const tr: number[] = [bars[0].high - bars[0].low];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i-1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }

  const atr: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  
  let prevAtr = sum / period;
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1) {
      atr.push(0);
    } else if (i === period - 1) {
      atr.push(prevAtr);
    } else {
      const currentAtr = (prevAtr * (period - 1) + tr[i]) / period;
      atr.push(currentAtr);
      prevAtr = currentAtr;
    }
  }
  return atr;
}

export function calculateRSI(data: number[], period: number = 14): number[] {
  if (data.length < period) return data.map(() => 50);
  
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      rsi.push(50);
    } else {
      const diff = data[i] - data[i - 1];
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) rsi.push(100);
      else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
  }
  return rsi;
}

export function calculateVWAP(bars: MarketBar[]): number[] {
  if (bars.length === 0) return [];
  
  const vwap: number[] = [];
  let cumulativePV = 0;
  let cumulativeV = 0;
  let currentDate = "";

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    // Get date in IST for correct daily reset
    const istDate = new Date(bar.timestamp.getTime() + (5.5 * 60 * 60 * 1000));
    const date = istDate.toISOString().split('T')[0];
    
    // Reset VWAP for each new day
    if (date !== currentDate) {
      cumulativePV = 0;
      cumulativeV = 0;
      currentDate = date;
    }

    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativePV += typicalPrice * bar.volume;
    cumulativeV += bar.volume;
    
    vwap.push(cumulativeV === 0 ? typicalPrice : cumulativePV / cumulativeV);
  }
  return vwap;
}

export function calculateTrendStrength(bars: MarketBar[]): { strength: number; direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' } {
  if (bars.length < 20) return { strength: 50, direction: 'NEUTRAL' };
  
  const current = bars[bars.length - 1];
  const ema9 = current.ema9 || current.close;
  const ema20 = current.ema20 || current.close;
  const vwap = current.vwap || current.close;
  
  // 1. EMA Alignment
  const isBullishEMA = ema9 > ema20;
  const isBearishEMA = ema9 < ema20;
  const emaGap = Math.abs(ema9 - ema20) / current.close * 1000;
  
  // 2. Price vs VWAP
  const isAboveVWAP = current.close > vwap;
  const isBelowVWAP = current.close < vwap;
  
  // 3. RSI Momentum
  const rsi = current.rsi || 50;
  const isBullishRSI = rsi > 50;
  const isBearishRSI = rsi < 50;
  const rsiStrength = Math.abs(rsi - 50) * 2;
  
  // 4. Slope of EMA 20 (over last 5 bars)
  const prev = bars[bars.length - 5];
  const prevEma20 = prev.ema20 || prev.close;
  const slope = (ema20 - prevEma20) / prevEma20 * 1000;
  
  // Determine Direction
  let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (isBullishEMA && isAboveVWAP && slope > 0) direction = 'BULLISH';
  else if (isBearishEMA && isBelowVWAP && slope < 0) direction = 'BEARISH';
  else if (isBullishEMA && isAboveVWAP) direction = 'BULLISH';
  else if (isBearishEMA && isBelowVWAP) direction = 'BEARISH';
  
  // Calculate Strength (0-100)
  let strength = (emaGap * 3) + (rsiStrength * 0.5) + (Math.abs(slope) * 8);
  
  // Bonus for alignment
  if (direction === 'BULLISH' && isBullishRSI) strength += 10;
  if (direction === 'BEARISH' && isBearishRSI) strength += 10;
  
  return { 
    strength: Math.min(Math.max(strength, 10), 100), 
    direction 
  };
}

export interface MarketBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema9?: number;
  ema20?: number;
  atr?: number;
  rsi?: number;
  vwap?: number;
  support?: number;
  resistance?: number;
}

export function processMarketData(raw: any): MarketBar[] {
  if (!raw || !raw.quotes) return [];
  
  const bars: MarketBar[] = raw.quotes.map((q: any) => ({
    timestamp: new Date(q.date),
    open: q.open,
    high: q.high,
    low: q.low,
    close: q.close,
    volume: q.volume,
  })).filter((b: any) => b.close !== null);

  const closes = bars.map(b => b.close);
  const ema9 = calculateEMA(closes, 9);
  const ema20 = calculateEMA(closes, 20);
  const atr = calculateATR(bars, 14);
  const rsi = calculateRSI(closes, 14);
  const vwap = calculateVWAP(bars);

  // Calculate Support and Resistance
  const srLevels = calculateSupportResistance(bars);

  return bars.map((b, i) => ({
    ...b,
    ema9: ema9[i],
    ema20: ema20[i],
    atr: atr[i],
    rsi: rsi[i],
    vwap: vwap[i],
    support: srLevels[i].support,
    resistance: srLevels[i].resistance,
  }));
}

export function calculateSupportResistance(bars: MarketBar[]): { support: number; resistance: number }[] {
  const levels: { support: number; resistance: number }[] = [];
  const period = 20; // Lookback period for pivots

  for (let i = 0; i < bars.length; i++) {
    if (i < period) {
      levels.push({ support: bars[i].low, resistance: bars[i].high });
      continue;
    }

    const lookback = bars.slice(Math.max(0, i - period), i + 1);
    const highs = lookback.map(b => b.high);
    const lows = lookback.map(b => b.low);

    // Simple pivot calculation: highest high and lowest low in period
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);

    levels.push({ support, resistance });
  }

  return levels;
}

export type MarketStatus = 'OPEN' | 'CLOSED' | 'PRE-MARKET' | 'POST-MARKET';

export function calculateHeikinAshi(bars: MarketBar[]): MarketBar[] {
  if (bars.length === 0) return [];

  const haBars: MarketBar[] = [];
  
  // First HA bar
  let prevHAOpen = (bars[0].open + bars[0].close) / 2;
  let prevHAClose = (bars[0].open + bars[0].high + bars[0].low + bars[0].close) / 4;

  haBars.push({
    ...bars[0],
    open: prevHAOpen,
    close: prevHAClose,
    high: Math.max(bars[0].high, prevHAOpen, prevHAClose),
    low: Math.min(bars[0].low, prevHAOpen, prevHAClose),
  });

  for (let i = 1; i < bars.length; i++) {
    const current = bars[i];
    const haClose = (current.open + current.high + current.low + current.close) / 4;
    const haOpen = (prevHAOpen + prevHAClose) / 2;
    const haHigh = Math.max(current.high, haOpen, haClose);
    const haLow = Math.min(current.low, haOpen, haClose);

    haBars.push({
      ...current,
      open: haOpen,
      close: haClose,
      high: haHigh,
      low: haLow,
    });

    prevHAOpen = haOpen;
    prevHAClose = haClose;
  }

  return haBars;
}

export function getIndianMarketStatus(): { status: MarketStatus; message: string; nextOpening?: string } {
  // Indian Market Holidays 2026 (NSE/BSE) - Tentative list
  const holidays2026 = [
    '2026-01-26', // Republic Day
    '2026-03-06', // Holi
    '2026-03-27', // Ram Navami
    '2026-03-31', // Mahavir Jayanti
    '2026-04-03', // Good Friday
    '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-08-15', // Independence Day
    '2026-10-02', // Gandhi Jayanti
    '2026-10-21', // Dussehra
    '2026-11-09', // Diwali-Laxmi Pujan (Muhurat trading usually happens)
    '2026-11-10', // Diwali-Balipratipada
    '2026-11-25', // Gurunanak Jayanti
    '2026-12-25', // Christmas
  ];

  // Get current time in IST
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
  
  const day = istTime.getDay();
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  const dateStr = istTime.toISOString().split('T')[0];

  // Weekend check
  if (day === 0 || day === 6) {
    return { status: 'CLOSED', message: 'Market is Closed (Weekend)' };
  }

  // Holiday check
  if (holidays2026.includes(dateStr)) {
    return { status: 'CLOSED', message: 'Market is Closed (Public Holiday)' };
  }

  // Time check (IST)
  // Pre-market: 09:00 - 09:15
  if (timeInMinutes >= 540 && timeInMinutes < 555) {
    return { status: 'PRE-MARKET', message: 'Pre-Market Session' };
  }
  
  // Normal Market: 09:15 - 15:30
  if (timeInMinutes >= 555 && timeInMinutes <= 930) {
    const signalStatus = timeInMinutes > 915 ? ' (Signals Stopped)' : '';
    return { status: 'OPEN', message: `Market is Open${signalStatus}` };
  }

  // Post-market: 15:40 - 16:00
  if (timeInMinutes >= 940 && timeInMinutes <= 960) {
    return { status: 'POST-MARKET', message: 'Post-Market Session' };
  }

  if (timeInMinutes < 540) {
    return { status: 'CLOSED', message: 'Market is Closed (Opens at 09:15 IST)' };
  }

  return { status: 'CLOSED', message: 'Market is Closed (After Hours)' };
}

export type SignalType = 'BUY' | 'SELL' | 'NEUTRAL';

export type TrendDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface Signal {
  type: SignalType;
  reason: string;
  timestamp: Date;
  price: number;
  entry?: number;
  sl?: number;
  tp?: number;
  confidence?: number;
  rrr?: number;
  isRetest?: boolean;
  isConfirmed?: boolean;
  status?: 'LIVE' | 'CONFIRMED';
  retestZone?: {
    min: number;
    max: number;
    startTime: Date;
    endTime: Date;
  };
  htfTrend?: TrendDirection;
  symbol?: string;
}

export function detectHTFTrend(bars: MarketBar[]): TrendDirection {
  if (bars.length < 20) return 'NEUTRAL';
  const current = bars[bars.length - 1];
  
  if (!current.ema9 || !current.ema20) return 'NEUTRAL';

  // HTF Trend is BULLISH if Close > EMA 20 and EMA 9 > EMA 20
  if (current.ema9 > current.ema20 && current.close > current.ema20) {
    return 'BULLISH';
  }
  
  // HTF Trend is BEARISH if Close < EMA 20 and EMA 9 < EMA 20
  if (current.ema9 < current.ema20 && current.close < current.ema20) {
    return 'BEARISH';
  }
  
  return 'NEUTRAL';
}

export function detectSignal(bars: MarketBar[], threshold: number = 85, htfTrend: TrendDirection = 'NEUTRAL'): Signal {
  if (bars.length < 20) {
    return { type: 'NEUTRAL', reason: 'Insufficient data for analysis (Need 20+ bars)', timestamp: new Date(), price: 0 };
  }

  const current = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  // Time check: Only allow signals after 9:30 AM IST (Retailer Safety Filter)
  // Converting UTC timestamp to IST: UTC + 5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(current.timestamp.getTime() + istOffset);
  
  // Use UTC methods on the offset date to get absolute IST hours/minutes
  const hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  if (timeInMinutes < 570) { // 9:30 AM IST = 570 minutes
    return { 
      type: 'NEUTRAL', 
      reason: 'Opening Volatility Filter: Signals start from 09:30 IST', 
      timestamp: current.timestamp, 
      price: current.close 
    };
  }

  if (timeInMinutes > 915) { // 3:15 PM IST = 915 minutes
    return { 
      type: 'NEUTRAL', 
      reason: 'Market Closing Filter: No signal entries after 15:15 IST (Squaring-off period)', 
      timestamp: current.timestamp, 
      price: current.close 
    };
  }

  if (!current.ema9 || !current.ema20 || !prev.ema9 || !prev.ema20 || !current.atr || !current.rsi || !current.vwap) {
    return { type: 'NEUTRAL', reason: 'Indicators not fully calculated', timestamp: new Date(), price: 0 };
  }

  // 1. Trend Identification & Slope Analysis
  const ema20Slope = (current.ema20! - prev.ema20!) / prev.ema20! * 1000;
  const emaSpread = Math.abs(current.ema9! - current.ema20!) / current.close * 100;
  
  // Relaxed VWAP and Slope constraints for volatile markets like Bank Nifty
  const vwapBuffer = current.close * 0.0002; // 0.02% buffer
  const isBullishTrend = current.ema9 > current.ema20 && current.close > (current.vwap! - vwapBuffer) && ema20Slope > 0.1; // Increased slope requirement
  const isBearishTrend = current.ema9 < current.ema20 && current.close < (current.vwap! + vwapBuffer) && ema20Slope < -0.1; // Increased slope requirement

  if (!isBullishTrend && !isBearishTrend) {
    return { type: 'NEUTRAL', reason: 'Analyzing trend stability (Trend too weak or flat)', timestamp: current.timestamp, price: current.close };
  }

  // 15-Minute Trend Guard (HTF Alignment)
  if (isBullishTrend && htfTrend !== 'BULLISH') {
    return { type: 'NEUTRAL', reason: 'Trend Alignment Filter: Waiting for 15m Bullish Confirmation', timestamp: current.timestamp, price: current.close };
  }
  if (isBearishTrend && htfTrend !== 'BEARISH') {
    return { type: 'NEUTRAL', reason: 'Trend Alignment Filter: Waiting for 15m Bearish Confirmation', timestamp: current.timestamp, price: current.close };
  }
  // Squeeze Filter: Avoid trading when EMAs are too close (Sideways/Choppy)
  if (emaSpread < 0.05) { // Increased from 0.03
    return { type: 'NEUTRAL', reason: 'Choppy Market Filter: EMA spread too narrow', timestamp: current.timestamp, price: current.close };
  }

  // 2. Volume Analysis
  const last10Bars = bars.slice(-10);
  const avgVolume = last10Bars.reduce((acc, b) => acc + b.volume, 0) / 10;
  const volumeRatio = current.volume / avgVolume;
  const hasVolumeConfirmation = volumeRatio > 1.25; // Increased from 1.05 for "Confirm then give signal"

  // 3. Volatility Filter (Sideways & Spike Market)
  const avgBodySize = last10Bars.reduce((acc, b) => acc + Math.abs(b.close - b.open), 0) / 10;
  const volatilityThreshold = current.close * 0.0003; // Increased threshold
  
  if (avgBodySize < volatilityThreshold) {
    return { type: 'NEUTRAL', reason: 'Low Volatility Filter: Market moving in tiny range', timestamp: current.timestamp, price: current.close };
  }

  // Spike Filter: Avoid entering on massive candles (SL hunting/News traps)
  const currentBody = Math.abs(current.close - current.open);
  if (currentBody > avgBodySize * 3.0) { // Tightened from 3.5
    return { type: 'NEUTRAL', reason: 'Volatile Spike Filter: Avoiding sudden news/spike candle', timestamp: current.timestamp, price: current.close };
  }

  // 4. 15 Min Breakout Filter (Retailer Range Filter)
  const first15MinBars = bars.filter(b => {
    const bIstTime = new Date(b.timestamp.getTime() + (b.timestamp.getTimezoneOffset() * 60000) + istOffset);
    const t = bIstTime.getHours() * 60 + bIstTime.getMinutes();
    return t >= 555 && t <= 570; // 9:15 to 9:30 IST
  });
  
  let breakoutConfirmed = true;
  if (first15MinBars.length > 0) {
    const high15 = Math.max(...first15MinBars.map(b => b.high));
    const low15 = Math.min(...first15MinBars.map(b => b.low));
    
    // Hard breakout rule for higher accuracy
    if (isBullishTrend && current.close < high15 * 1.0002) breakoutConfirmed = false;
    if (isBearishTrend && current.close > low15 * 0.9998) breakoutConfirmed = false;
  }

  if (!breakoutConfirmed) {
    return { type: 'NEUTRAL', reason: 'Initial Range Filter: Waiting for clear breakout from 9:15-9:30 zone', timestamp: current.timestamp, price: current.close };
  }

  // 5. Retest Logic
  let crossoverIndex = -1;
  for (let i = bars.length - 2; i > bars.length - 40 && i > 0; i--) { // Reduced lookback for freshness
    const b = bars[i];
    const pb = bars[i - 1];
    if (isBullishTrend && pb.ema9! <= pb.ema20! && b.ema9! > b.ema20!) {
      crossoverIndex = i;
      break;
    }
    if (isBearishTrend && pb.ema9! >= pb.ema20! && b.ema9! < b.ema20!) {
      crossoverIndex = i;
      break;
    }
  }

  const hasCrossoverRecently = crossoverIndex !== -1;
  if (!hasCrossoverRecently) {
    return { type: 'NEUTRAL', reason: 'Waiting for fresh EMA alignment (9/20 crossover)', timestamp: current.timestamp, price: current.close };
  }
  
  // Price moved away check
  let movedAwayCount = 0;
  if (hasCrossoverRecently) {
    for (let i = crossoverIndex; i < bars.length - 1; i++) {
      const b = bars[i];
      if (isBullishTrend && b.close > b.ema9!) movedAwayCount++;
      if (isBearishTrend && b.close < b.ema9!) movedAwayCount++;
    }
  }

  if (hasCrossoverRecently && movedAwayCount < 2) {
    return { type: 'NEUTRAL', reason: 'Confirming breakout strength (Need 2+ candles away from EMAs)', timestamp: current.timestamp, price: current.close };
  }

  // Retest check: Price touches or comes near 9, 20 EMA or VWAP
  const proximity = current.close * 0.00015; // Tightened
  const touchesEMA9 = current.low <= current.ema9! + proximity && current.high >= current.ema9! - proximity;
  const touchesEMA20 = current.low <= current.ema20! + proximity && current.high >= current.ema20! - proximity;
  const touchesVWAP = current.low <= current.vwap! + proximity && current.high >= current.vwap! - proximity;
  
  const isRetesting = touchesEMA9 || touchesEMA20 || touchesVWAP; 
  
  if (!isRetesting) {
    return { type: 'NEUTRAL', reason: 'Scanning for high-probability retest (EMA 9/20/VWAP)', timestamp: current.timestamp, price: current.close };
  }

  // 6. Confirmation Candle & RSI (Conservative Mode)
  const isGreen = current.close > current.open;
  const isRed = current.close < current.open;
  const bodySize = Math.abs(current.close - current.open);
  const lowerWick = Math.min(current.open, current.close) - current.low;
  const upperWick = current.high - Math.max(current.open, current.close);
  
  // Confirmation: Stricter body size for accuracy
  const isBullishConfirmation = isGreen && (bodySize > avgBodySize * 0.8 || lowerWick > bodySize * 2.0);
  const isBearishConfirmation = isRed && (bodySize > avgBodySize * 0.8 || upperWick > bodySize * 2.0);

  const rsiBullish = current.rsi > 55; // Increased from 50
  const rsiBearish = current.rsi < 45; // Decreased from 50

  if (isBullishTrend && isRetesting && (!isBullishConfirmation || !rsiBullish)) {
    const rsiReason = !rsiBullish ? " (Momentum weak)" : "";
    const candleReason = !isBullishConfirmation ? " (Candle weak)" : "";
    return { type: 'NEUTRAL', reason: `Retest confirmed - waiting for momentum surge${rsiReason}${candleReason}`, timestamp: current.timestamp, price: current.close };
  }
  if (isBearishTrend && isRetesting && (!isBearishConfirmation || !rsiBearish)) {
    const rsiReason = !rsiBearish ? " (Momentum weak)" : "";
    const candleReason = !isBearishConfirmation ? " (Candle weak)" : "";
    return { type: 'NEUTRAL', reason: `Retest confirmed - waiting for momentum surge${rsiReason}${candleReason}`, timestamp: current.timestamp, price: current.close };
  }

  // Extra Accuracy Filter: Volume should at least be average on confirmation
  if (current.volume < avgVolume * 0.9) {
    return { type: 'NEUTRAL', reason: 'Accuracy Filter: Confirmation candle has low volume', timestamp: current.timestamp, price: current.close };
  }

  // 7. Signal Generation
  if (isBullishTrend && isRetesting && isBullishConfirmation && rsiBullish && current.close > current.ema9) {
    // SL: Below recent low or EMA20, whichever is tighter but safe
    const sl = Math.min(current.low, current.ema20! - (0.5 * current.atr));
    const risk = current.close - sl;
    
    // Filter out trades with excessive risk (>1% of price)
    if (risk > current.close * 0.01) return { type: 'NEUTRAL', reason: 'Risk too high (Wide SL > 1%)', timestamp: current.timestamp, price: current.close };
    if (risk < current.close * 0.001) return { type: 'NEUTRAL', reason: 'Risk too low (Invalid SL)', timestamp: current.timestamp, price: current.close };

    // Minimum Point Target Check (Nifty ~20, BankNifty ~40)
    const isNifty = current.close > 15000 && current.close < 30000;
    const isBankNifty = current.close > 35000 && current.close < 60000;
    const minPoints = isBankNifty ? 40 : isNifty ? 20 : (current.close * 0.001);
    
    const tp = current.close + risk * 2.0;
    const potentialPoints = tp - current.close;
    
    if (potentialPoints < minPoints) {
      return { type: 'NEUTRAL', reason: `Potential profit (${potentialPoints.toFixed(1)}) below minimum target (${minPoints})`, timestamp: current.timestamp, price: current.close };
    }

    const rrr = 2.0;
    
    let confidence = 50; // Lowered from 60
    if (touchesEMA9) confidence += 5;
    if (touchesEMA20) confidence += 10; // EMA 20 retest is more reliable
    if (touchesVWAP) confidence += 5;
    if (ema20Slope > 0.15) confidence += 15; // Higher slope requirement
    if (lowerWick > bodySize * 3.0) confidence += 15; // Requires real rejection
    if (volumeRatio > 1.5) confidence += 10; // High volume surge
    if (current.rsi > 65) confidence += 5;
    if (breakoutConfirmed) confidence += 5;
    else confidence -= 20; // Heavier penalty for no range breakout

    if (confidence < threshold) return { type: 'NEUTRAL', reason: `High-accuracy filter: Setup confidence ${confidence}% (Threshold: ${threshold}%)`, timestamp: current.timestamp, price: current.close, confidence };

    return {
      type: 'BUY',
      reason: `BUY CE: High-Confidence Retest`,
      timestamp: current.timestamp,
      price: current.close,
      entry: current.close,
      sl,
      tp,
      confidence: Math.min(confidence, 99),
      rrr,
      isRetest: true
    };
  }

  if (isBearishTrend && isRetesting && isBearishConfirmation && rsiBearish && movedAwayCount >= 2 && current.close < current.ema9) {
    // SL: Above recent high or EMA20
    const sl = Math.max(current.high, current.ema20! + (0.5 * current.atr));
    const risk = sl - current.close;
    
    if (risk > current.close * 0.01) return { type: 'NEUTRAL', reason: 'Risk too high (Wide SL > 1%)', timestamp: current.timestamp, price: current.close };
    if (risk < current.close * 0.001) return { type: 'NEUTRAL', reason: 'Risk too low (Invalid SL)', timestamp: current.timestamp, price: current.close };

    // Minimum Point Target Check
    const isNifty = current.close > 15000 && current.close < 30000;
    const isBankNifty = current.close > 35000 && current.close < 60000;
    const minPoints = isBankNifty ? 40 : isNifty ? 20 : (current.close * 0.001);

    const tp = current.close - risk * 2.0;
    const potentialPoints = current.close - tp;

    if (potentialPoints < minPoints) {
      return { type: 'NEUTRAL', reason: `Potential profit (${potentialPoints.toFixed(1)}) below minimum target (${minPoints})`, timestamp: current.timestamp, price: current.close };
    }

    const rrr = 2.0;
    
    let confidence = 45; // Lowered from 55
    if (touchesEMA20) confidence += 10;
    if (touchesVWAP) confidence += 5;
    if (ema20Slope < -0.15) confidence += 15; // Higher slope requirement
    if (upperWick > bodySize * 3.0) confidence += 15;
    if (volumeRatio > 1.5) confidence += 10; 
    if (current.rsi < 35) confidence += 5;
    if (breakoutConfirmed) confidence += 5;
    else confidence -= 25; // Heavier penalty for selling inside 9:15 range

    if (confidence < threshold) return { type: 'NEUTRAL', reason: `High-accuracy filter: Setup confidence ${confidence}% (Threshold: ${threshold}%)`, timestamp: current.timestamp, price: current.close, confidence };

    return {
      type: 'SELL',
      reason: `BUY PE: High-Confidence Retest`,
      timestamp: current.timestamp,
      price: current.close,
      entry: current.close,
      sl,
      tp,
      confidence: Math.min(confidence, 99),
      rrr,
      isRetest: true
    };
  }

  return { type: 'NEUTRAL', reason: 'Analyzing market for VWAP/EMA retest...', timestamp: current.timestamp, price: current.close };
}

export function getAllSignals(bars: MarketBar[], threshold: number = 85, htfTrend: TrendDirection = 'NEUTRAL'): Signal[] {
  const signals: Signal[] = [];
  if (bars.length === 0) return [];

  for (let i = 30; i <= bars.length; i++) {
    const subBars = bars.slice(0, i);
    const signal = detectSignal(subBars, threshold, htfTrend);
    if (signal.type !== 'NEUTRAL') {
      const isLastBar = i === bars.length;
      signal.isConfirmed = !isLastBar;
      signal.status = isLastBar ? 'LIVE' : 'CONFIRMED';

      // Check if this is a new signal (different timestamp) AND not a consecutive signal of the same type
      const lastSignal = signals.length > 0 ? signals[signals.length - 1] : null;
      const isNewTimestamp = !lastSignal || lastSignal.timestamp.getTime() !== signal.timestamp.getTime();
      
      // If it's the same type as the last signal, ensure there's a gap of at least 15 bars
      // This prevents "duplicate" entries during a prolonged retest or consolidation
      let isNotConsecutive = true;
      if (lastSignal && lastSignal.type === signal.type) {
        // Find the index of the last signal in the original bars array
        const lastSignalIndex = bars.findIndex(b => b.timestamp.getTime() === lastSignal.timestamp.getTime());
        const currentSignalIndex = i - 1;
        if (currentSignalIndex - lastSignalIndex < 15) { // Increased from 5
          isNotConsecutive = false;
        }
      }

      const istOffset = 5.5 * 60 * 60 * 1000;
      const istDate = new Date(signal.timestamp.getTime() + istOffset);
      const hours = istDate.getUTCHours();
      const minutes = istDate.getUTCMinutes();
      const totalMinutes = hours * 60 + minutes;

      // 09:45 AM = 585 mins (delayed start for even more stability), 03:00 PM = 900 mins
      const isWithinTimeWindow = totalMinutes >= 585 && totalMinutes <= 900;

      const getIstDayString = (ts: Date) => new Date(ts.getTime() + istOffset).toISOString().split('T')[0];
      
      const latestBarIstDay = getIstDayString(bars[bars.length - 1].timestamp);
      const signalIstDay = getIstDayString(signal.timestamp);
      const isCurrentDay = signalIstDay === latestBarIstDay;

      // Limit to 6 signals per day TOTAL to ensure absolute top-tier quality
      const dailyCount = signals.filter(ts => getIstDayString(ts.timestamp) === signalIstDay).length;

      if (isNewTimestamp && isNotConsecutive && isCurrentDay && isWithinTimeWindow && dailyCount < 6) { // Reduced from 10
        signals.push(signal);
      }
    }
  }
  return signals;
}

export function runBacktest(bars: MarketBar[], threshold: number = 85) {
  const trades: any[] = [];
  let currentTrade: any = null;

  for (let i = 30; i < bars.length; i++) {
    const subBars = bars.slice(0, i);
    const bar = bars[i];
    
    if (!currentTrade) {
      const signal = detectSignal(subBars, threshold);
      if (signal.type !== 'NEUTRAL') {
        currentTrade = {
          ...signal,
          id: `trade-${bar.timestamp.getTime()}-${Math.random().toString(36).substr(2, 9)}`,
          entryPrice: bar.open,
          status: 'OPEN'
        };
      }
    } else {
      // Check SL/TP
      if (currentTrade.type === 'BUY') {
        if (bar.low <= currentTrade.sl) {
          trades.push({ ...currentTrade, exitPrice: currentTrade.sl, result: 'LOSS', exitTime: bar.timestamp });
          currentTrade = null;
        } else if (bar.high >= currentTrade.tp) {
          trades.push({ ...currentTrade, exitPrice: currentTrade.tp, result: 'WIN', exitTime: bar.timestamp });
          currentTrade = null;
        }
      } else if (currentTrade.type === 'SELL') {
        if (bar.high >= currentTrade.sl) {
          trades.push({ ...currentTrade, exitPrice: currentTrade.sl, result: 'LOSS', exitTime: bar.timestamp });
          currentTrade = null;
        } else if (bar.low <= currentTrade.tp) {
          trades.push({ ...currentTrade, exitPrice: currentTrade.tp, result: 'WIN', exitTime: bar.timestamp });
          currentTrade = null;
        }
      }
    }
  }

  const wins = trades.filter(t => t.result === 'WIN').length;
  const losses = trades.filter(t => t.result === 'LOSS').length;
  const accuracy = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  
  return {
    trades,
    stats: {
      total: trades.length,
      wins,
      losses,
      accuracy
    }
  };
}
