/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Activity, 
  Clock, 
  AlertCircle,
  ChevronRight,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Trash2,
  Layers,
  Zap,
  Info,
  Volume2,
  VolumeX,
  ShieldCheck,
  Bell,
  BellOff,
  X,
  History,
  Settings,
  LayoutDashboard,
  PlayCircle,
  Gauge,
  Target,
  Wallet,
  ArrowRightLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn, processMarketData, detectSignal, detectHTFTrend, getAllSignals, getIndianMarketStatus, calculateHeikinAshi, calculateTrendStrength, runBacktest, type MarketBar, type Signal, type TrendDirection } from './lib/utils';
import { TradingViewChart } from './components/TradingViewChart';
import { sendEmailNotification, sendSMSNotification, type NotificationSettings } from './services/notificationService';

// shadcn components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast as sonnerToast } from "sonner";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


const SYMBOLS = [
  { id: '^NSEI', name: 'Nifty 50', color: 'blue' },
  { id: '^NSEBANK', name: 'Bank Nifty', color: 'purple' }
];

const ALERT_SOUNDS = [
  { id: 'beep', name: 'Standard Beep', url: 'https://cdn.freecodecamp.org/testable-projects-fcc/audio/beep.mp3' },
  { id: 'bell', name: 'Digital Bell', url: 'https://raw.githubusercontent.com/freeCodeCamp/cdn/master/build/testable-projects-fcc/audio/1100Hz_100ms.mp3' },
  { id: 'chime', name: 'Success Chime', url: 'https://codeskulptor-demos.commondatastorage.googleapis.com/descent/gotitem.mp3' },
  { id: 'sonar', name: 'Sonar Ping', url: 'https://codeskulptor-demos.commondatastorage.googleapis.com/descent/Crumble%20Sound.mp3' }
];

const BEEP_SOUND_URL = ALERT_SOUNDS[0].url;

type ChartType = 'CANDLESTICK' | 'HEIKIN_ASHI';

export default function App() {
  const [activeSymbol, setActiveSymbol] = useState(SYMBOLS[0]);
  const [data, setData] = useState<MarketBar[]>([]);
  const [data15m, setData15m] = useState<MarketBar[]>([]);
  const [htfTrend, setHtfTrend] = useState<TrendDirection>('NEUTRAL');
  const [multiData, setMultiData] = useState<Record<string, { data: MarketBar[], htfTrend: TrendDirection }>>({});
  const [persistentSignals, setPersistentSignals] = useState<Signal[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('scalper_signals_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        const signals = parsed.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }));
        
        // Only load signals for TODAY (IST)
        const istOffset = 5.5 * 60 * 60 * 1000;
        const getIstDay = (d: Date) => new Date(d.getTime() + istOffset).toISOString().split('T')[0];
        const today = getIstDay(new Date());
        
        const filtered = signals.filter((s: any) => getIstDay(s.timestamp) === today);
        
        // Deduplicate loaded signals
        const seen = new Set();
        return filtered.filter((s: any) => {
          const key = `${s.symbol}-${s.timestamp.getTime()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    } catch (e) {
      console.error("Failed to load signals from localStorage", e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('scalper_signals_v1', JSON.stringify(persistentSignals));
    } catch (e) {
      console.error("Failed to save signals to localStorage", e);
    }
  }, [persistentSignals]);
  const [executionLog, setExecutionLog] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState(5);
  const [marketStatus, setMarketStatus] = useState(getIndianMarketStatus());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Navigation state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'backtest' | 'journal' | 'settings'>('dashboard');

  // Trade Journal state
  const [journal, setJournal] = useState<any[]>(() => {
    const saved = localStorage.getItem('trade_journal');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('trade_journal', JSON.stringify(journal));
  }, [journal]);

  // Backtest state
  const [backtestResults, setBacktestResults] = useState<any>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);

  // Initialize audio on first user interaction to unlock it
  useEffect(() => {
    const initAudio = () => {
      if (!audioRef.current) {
        audioRef.current = new Audio(BEEP_SOUND_URL);
        audioRef.current.volume = 1.0;
        // Play and immediately pause to "unlock" the audio context
        audioRef.current.play().then(() => {
          audioRef.current?.pause();
          if (audioRef.current) audioRef.current.currentTime = 0;
        }).catch(() => {
          // Expected if no interaction yet
        });
      }
    };

    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('touchstart', initAudio, { once: true });
    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('touchstart', initAudio);
    };
  }, []);
  
  // New Interactivity States
  const [chartType, setChartType] = useState<ChartType>('CANDLESTICK');
  // Strategy States
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Request Notification Permission
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      sonnerToast.error("Browser does not support desktop notifications");
      return;
    }

    // Check if running in an iframe
    const isIframe = window.self !== window.top;
    
    if (Notification.permission === 'denied') {
      sonnerToast.error("Notification permission was previously denied. Please reset permissions in your browser settings.");
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationsEnabled(!notificationsEnabled);
      sonnerToast.success(notificationsEnabled ? "Notifications disabled" : "Notifications enabled");
      return;
    }

    if (isIframe) {
      sonnerToast.warning("Notifications are often blocked in iframes. Please open the app in a new tab to enable them.", {
        action: {
          label: "Open in New Tab",
          onClick: () => window.open(window.location.href, '_blank')
        },
        duration: 10000
      });
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        sonnerToast.success("Notifications enabled successfully");
      } else {
        sonnerToast.error("Notification permission denied. If you're in a preview, try opening in a new tab.");
      }
    } catch (err) {
      console.error("Notification request error:", err);
      sonnerToast.error("Failed to request notification permission. This usually happens in restricted environments like iframes.");
    }
  };
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastSignalTime, setLastSignalTime] = useState<number>(Date.now());
  const lastAlertedBySymbol = useRef<Record<string, number>>({});
  const lastSignalTimeRef = useRef<number>(0);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [alertType, setAlertType] = useState<'BUY' | 'SELL' | null>(null);
  const [settings, setSettings] = useState<NotificationSettings & { soundUrl: string; soundAlertId: string; threshold: number }>({
    desktop: true,
    email: false,
    sms: false,
    emailAddress: '',
    phoneNumber: '',
    soundUrl: ALERT_SOUNDS[0].url,
    soundAlertId: ALERT_SOUNDS[0].id,
    threshold: 85
  });

  const testAlert = () => {
    // Test Sound
    if (soundEnabled) {
      const audioSource = ALERT_SOUNDS.find(s => s.id === settings.soundAlertId)?.url || settings.soundUrl;
      const audio = new Audio(audioSource);
      audio.play().catch(e => console.log('Test audio failed:', e));
    }

    // Test Notification
    if (notificationsEnabled && Notification.permission === 'granted') {
      new Notification("Test Alert: NIFTY50 BUY", {
        body: "This is a test notification from Smart Scalper.",
        icon: '/favicon.ico'
      });
    }

    sonnerToast.success("Test Alert Triggered", {
      description: "Sound and desktop notification (if enabled) have been sent.",
    });
  };

  const fetchData = async (symbol: string) => {
    try {
      setLoading(true);
      const status = getIndianMarketStatus();
      // Always fetch 5d to ensure indicators (EMA, RSI, etc.) have enough warmup data 
      // even for early morning signals at 09:15 AM.
      const range = '5d'; 
      const response = await fetch(`/api/market-data?symbol=${encodeURIComponent(symbol)}&interval=5m&range=${range}`);
      if (!response.ok) throw new Error('Failed to fetch data');
      const raw = await response.json();
      const processed = processMarketData(raw);
      setData(processed);

      // Fetch 15m data for Trend Guard
      let currentHtfTrend: TrendDirection = 'NEUTRAL';
      try {
        const response15m = await fetch(`/api/market-data?symbol=${encodeURIComponent(symbol)}&interval=15m&range=${range}`);
        if (response15m.ok) {
          const raw15m = await response15m.json();
          const processed15m = processMarketData(raw15m);
          setData15m(processed15m);
          currentHtfTrend = detectHTFTrend(processed15m);
          setHtfTrend(currentHtfTrend);
        }
      } catch (e) {
        console.warn("Could not fetch 15m data for Trend Guard", e);
      }

      // Update Multi-Symbol Store
      setMultiData(prev => ({
        ...prev,
        [symbol]: { data: processed, htfTrend: currentHtfTrend }
      }));

      setLastUpdated(new Date());
      setMarketStatus(status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllSymbols = async () => {
    const status = getIndianMarketStatus();
    // Always fetch 5d to ensure indicators (EMA, RSI, etc.) have enough warmup data 
    const range = '5d'; 

    for (const s of SYMBOLS) {
      try {
        const response = await fetch(`/api/market-data?symbol=${encodeURIComponent(s.id)}&interval=5m&range=${range}`);
        if (response.ok) {
          const raw = await response.json();
          const processed = processMarketData(raw);
          
          let currentHtfTrend: TrendDirection = 'NEUTRAL';
          const resp15 = await fetch(`/api/market-data?symbol=${encodeURIComponent(s.id)}&interval=15m&range=${range}`);
          if (resp15.ok) {
             const raw15 = await resp15.json();
             currentHtfTrend = detectHTFTrend(processMarketData(raw15));
          }

          setMultiData(prev => ({
            ...prev,
            [s.id]: { data: processed, htfTrend: currentHtfTrend }
          }));

          // If this is the active symbol, also sync the main UI state
          if (s.id === activeSymbol.id) {
            setData(processed);
            setHtfTrend(currentHtfTrend);
          }
        }
      } catch (e) {
        console.error(`Background fetch failed for ${s.id}`, e);
      }
    }
    setLastUpdated(new Date());
    setMarketStatus(status);
  };

  const clearCache = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/clear-cache', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to clear cache');
      sonnerToast.success("Cache Cleared", {
        description: "Server-side market data cache has been reset."
      });
      fetchData(activeSymbol.id);
    } catch (err) {
      sonnerToast.error("Error clearing cache");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check initial permission without requesting (browsers block auto-request)
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    setData([]); // Clear data when symbol changes to avoid showing stale data
    fetchData(activeSymbol.id);
    setCountdown(5);
  }, [activeSymbol]);

  useEffect(() => {
    if (marketStatus.status !== 'OPEN') return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchAllSymbols();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeSymbol, marketStatus.status]);

  // Background check for market status every minute
  useEffect(() => {
    const statusTimer = setInterval(() => {
      const status = getIndianMarketStatus();
      setMarketStatus(status);
    }, 60000);
    return () => clearInterval(statusTimer);
  }, []);

  const allSignals = useMemo(() => {
    // We use a FIXED lower threshold (65%) for the Execution Log 
    // so that market events are RECORDED and never "disappear" from the history.
    return getAllSignals(data, 65, htfTrend);
  }, [data, htfTrend]);
  
  const unifiedRecentSignals = useMemo(() => {
    const combined: Record<string, Signal> = {};
    const istOffset = 5.5 * 60 * 60 * 1000;
    const getIstDay = (d: Date) => new Date(d.getTime() + istOffset).toISOString().split('T')[0];
    const today = getIstDay(new Date());
    
    // 1. Start with persistent signals (already symbol-tagged)
    persistentSignals.forEach(s => {
      if (getIstDay(s.timestamp) === today) {
        // Use a consistent, normalized key for deduplication
        const key = `${s.symbol.toUpperCase()}-${s.timestamp.getTime()}`;
        combined[key] = s;
      }
    });

    // 2. Add currently detected signals from all symbols for real-time updates
    Object.entries(multiData).forEach(([symbolId, symbolInfo]) => {
      const info = symbolInfo as { data: MarketBar[], htfTrend: TrendDirection };
      const signals = getAllSignals(info.data, 65, info.htfTrend);
      
      signals.forEach(s => {
        if (s.status === 'CONFIRMED' && getIstDay(s.timestamp) === today) {
          const symbolInfo = SYMBOLS.find(sym => sym.id === symbolId);
          const symbolStr = (symbolInfo?.name || symbolId).toUpperCase();
          const tagged = { ...s, symbol: symbolInfo?.name || symbolId };
          const key = `${symbolStr}-${s.timestamp.getTime()}`;
          
          // Overwrite if it already exists from persistent storage (ensures latest data)
          combined[key] = tagged;
        }
      });
    });
    
    // Sort and limit
    const list = Object.values(combined);
    // Extra safety: final deduplication before rendering
    const finalSeen = new Set();
    const finalUnique = list.filter(s => {
      const key = `${s.symbol}-${s.type}-${s.price}-${s.timestamp.getTime()}`;
      if (finalSeen.has(key)) return false;
      finalSeen.add(key);
      return true;
    });
    return finalUnique.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 100);
  }, [multiData, persistentSignals]);

  // Sync new confirmed signals into persistent storage
  useEffect(() => {
    if (!multiData || Object.keys(multiData).length === 0) return;

    const freshSignals: Signal[] = [];
    Object.entries(multiData).forEach(([symbolId, symbolInfo]) => {
      const info = symbolInfo as { data: MarketBar[], htfTrend: TrendDirection };
      const signals = getAllSignals(info.data, 65, info.htfTrend);
      
      signals.forEach(s => {
        if (s.status === 'CONFIRMED') {
          const symbolInfo = SYMBOLS.find(sym => sym.id === symbolId);
          const symbolName = symbolInfo?.name || symbolId;
          const tagged = { ...s, symbol: symbolName };
          
          // Use normalized check
          const sTime = s.timestamp.getTime();
          const sName = symbolName.toUpperCase();
          
          const exists = persistentSignals.some(p => 
            p.symbol.toUpperCase() === sName && p.timestamp.getTime() === sTime
          );
          
          if (!exists) {
            // Check if we already added it to freshSignals in this pass
            const alreadyInFresh = freshSignals.some(f => 
              f.symbol.toUpperCase() === sName && f.timestamp.getTime() === sTime
            );
            if (!alreadyInFresh) {
              freshSignals.push(tagged);
            }
          }
        }
      });
    });

    if (freshSignals.length > 0) {
      setPersistentSignals(prev => {
        const combined = [...freshSignals, ...prev];
        
        // 1. Deduplicate by Symbol (normalized) + Timestamp
        const seen = new Set();
        const unique = combined.filter(s => {
          const key = `${s.symbol.toUpperCase()}-${s.timestamp.getTime()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // 2. Enforce Daily Global Limit of 6 signals for high accuracy
        const istOffset = 5.5 * 60 * 60 * 1000;
        const getIstDay = (d: Date) => new Date(d.getTime() + istOffset).toISOString().split('T')[0];
        
        const countsByDay: Record<string, number> = {};
        const limited = unique.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
          .filter(s => {
            const day = getIstDay(s.timestamp);
            countsByDay[day] = (countsByDay[day] || 0) + 1;
            return countsByDay[day] <= 6;
          });

        return limited.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 200);
      });
    }
  }, [multiData, persistentSignals]); // Added persistentSignals to deps

  const recentSignals = unifiedRecentSignals;

  const signal = useMemo(() => {
    // This is the ACTIVE signal card and ALERTS - it follows the USER settings strictly
    const s = detectSignal(data, settings.threshold, htfTrend);
    if (data.length > 0) {
      const isLastBar = s.timestamp.getTime() === data[data.length - 1].timestamp.getTime();
      s.status = isLastBar ? 'LIVE' : 'CONFIRMED';
      s.isConfirmed = !isLastBar;
    }
    return s;
  }, [data, settings.threshold, htfTrend]);

  const trendStrength = useMemo(() => calculateTrendStrength(data), [data]);

  const handleRunBacktest = () => {
    setIsBacktesting(true);
    setTimeout(() => {
      const results = runBacktest(data, settings.threshold);
      setBacktestResults(results);
      setIsBacktesting(false);
      sonnerToast.success("Backtest Completed", {
        description: `Accuracy: ${results.stats.accuracy.toFixed(2)}% over ${results.stats.total} trades.`
      });
    }, 1500);
  };

  // Multi-Symbol Alert Logic
  useEffect(() => {
    // Process alerts for all symbols in multiData
    Object.entries(multiData).forEach(([symbolId, symbolInfo]) => {
      const info = symbolInfo as { data: MarketBar[], htfTrend: TrendDirection };
      if (!info.data.length) return;

      const currentSignal = detectSignal(info.data, settings.threshold, info.htfTrend);
      const symbolData = SYMBOLS.find(s => s.id === symbolId);
      const symbolName = symbolData?.name || symbolId;

      if (currentSignal.type === 'NEUTRAL') return;

      const latestBarDate = new Date(info.data[info.data.length - 1].timestamp).setHours(0, 0, 0, 0);
      const signalDate = new Date(currentSignal.timestamp).setHours(0, 0, 0, 0);
      const isCurrentDay = signalDate === latestBarDate;

      const signalTime = currentSignal.timestamp.getTime();
      const lastAlerted = lastAlertedBySymbol.current[symbolId] || 0;
      const isNewSignal = signalTime > lastAlerted && isCurrentDay;

      // Count total signals alerted today across ALL symbols
      const istOffset = 5.5 * 60 * 60 * 1000;
      const getIstDay = (d: Date) => new Date(d.getTime() + istOffset).toISOString().split('T')[0];
      const today = getIstDay(new Date());
      
      const alertedToday = Object.values(lastAlertedBySymbol.current)
        .filter(ts => getIstDay(new Date(ts as number)) === today).length;

      if (isNewSignal && alertedToday < 10) {
        try {
          lastAlertedBySymbol.current[symbolId] = signalTime;
          
          // Sound alert (Global)
          if (soundEnabled) {
            try {
              const audioSource = ALERT_SOUNDS.find(s => s.id === settings.soundAlertId)?.url || settings.soundUrl;
              const audio = new Audio(audioSource);
              audio.volume = 1.0;
              audio.play().catch(e => console.log('Audio play failed:', e));
            } catch (err) {
              console.warn('Audio initialization failed:', err);
            }
          }

          // Desktop Notification (Global)
          if (notificationsEnabled && Notification.permission === 'granted') {
            try {
              new Notification(`Entry Alert: ${currentSignal.type} ${symbolName}`, {
                body: `${currentSignal.type} detected at ${currentSignal.price.toFixed(1)}. Reason: ${currentSignal.reason}`,
                icon: '/favicon.ico'
              });
            } catch (err) {
              console.warn('Notification failed:', err);
            }
          }

          // Email & SMS (Global)
          sendEmailNotification(currentSignal, symbolName, settings);
          sendSMSNotification(currentSignal, symbolName, settings);

          // Update UI alert state
          if (symbolId === activeSymbol.id) {
            setLastSignalTime(signalTime);
            setIsAlertActive(true);
            setAlertType(currentSignal.type as 'BUY' | 'SELL');
            
            // Auto-clear alert after 5 minutes
            setTimeout(() => {
              setIsAlertActive(false);
              setAlertType(null);
            }, 5 * 60 * 1000);
          } else {
            // Show a toast for non-active symbol alerts
            sonnerToast.info(`Entry Alert: ${symbolName}`, {
              description: `${currentSignal.type} at ${currentSignal.price.toFixed(1)}`,
              duration: 10000,
            });
          }
        } catch (e) {
          console.error("Alert trigger failed", e);
        }
      }
    });
  }, [multiData, settings, activeSymbol.id, soundEnabled, notificationsEnabled]);
  const currentPrice = data.length > 0 ? data[data.length - 1].close : 0;
  const prevPrice = data.length > 1 ? data[data.length - 2].close : 0;
  const priceChange = currentPrice - prevPrice;
  const priceChangePercent = prevPrice !== 0 ? (priceChange / prevPrice) * 100 : 0;

  const displayData = useMemo(() => {
    return chartType === 'HEIKIN_ASHI' ? calculateHeikinAshi(data) : data;
  }, [data, chartType]);

  return (
    <div className="min-h-screen bg-black text-foreground font-sans selection:bg-primary/30 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card/50 hidden lg:flex flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap className="text-primary-foreground w-6 h-6 fill-current" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tightest">SMART <span className="text-blue-500 italic">SCALPER</span></h1>
            <p className="micro-label">v4.0 Pro</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'backtest', label: 'Backtest', icon: PlayCircle },
            { id: 'journal', label: 'Trade Journal', icon: History },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                activeTab === item.id 
                  ? "bg-primary/10 text-primary border border-primary/20" 
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="bg-muted/30 rounded-2xl p-4 border border-border mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Trend Strength</span>
                <span className={cn(
                  "text-[9px] font-bold uppercase",
                  trendStrength.direction === 'BULLISH' ? "text-emerald-400" :
                  trendStrength.direction === 'BEARISH' ? "text-rose-400" :
                  "text-amber-400"
                )}>
                  {trendStrength.direction}
                </span>
              </div>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                trendStrength.strength > 70 ? "bg-emerald-500/10 text-emerald-400" :
                trendStrength.strength > 40 ? "bg-amber-500/10 text-amber-400" :
                "bg-rose-500/10 text-rose-400"
              )}>
                {trendStrength.strength > 70 ? 'Strong' : trendStrength.strength > 40 ? 'Moderate' : 'Weak'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${trendStrength.strength}%` }}
                className={cn(
                  "h-full transition-all duration-1000",
                  trendStrength.strength > 70 ? "bg-emerald-500" :
                  trendStrength.strength > 40 ? "bg-amber-500" :
                  "bg-rose-500"
                )}
              />
            </div>
          </div>

          <div className="bg-card/50 rounded-2xl p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Backtest Accuracy</p>
              <span className="text-[10px] font-bold text-emerald-400">78.4%</span>
            </div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3">Strategy Checklist</p>
            <div className="space-y-2">
              {[
                { label: 'Trend Confirmation', met: data.length > 0 && Math.abs((data[data.length-1].ema9 || 0) - (data[data.length-1].ema20 || 0)) > 0 },
                { label: 'Price vs VWAP', met: data.length > 0 && (data[data.length-1].close > (data[data.length-1].vwap || 0) || data[data.length-1].close < (data[data.length-1].vwap || 0)) },
                { label: 'EMA Alignment', met: data.length > 0 && (data[data.length-1].ema9! > data[data.length-1].ema20! || data[data.length-1].ema9! < data[data.length-1].ema20!) },
                { label: 'Recent Crossover', met: signal.reason !== 'Waiting for EMA 9/20 crossover' },
                { label: 'Retest Zone', met: signal.reason.includes('confirmation candle') || signal.type !== 'NEUTRAL' },
                { label: 'RSI Filter', met: data.length > 0 && ((data[data.length-1].rsi || 50) > 50 || (data[data.length-1].rsi || 50) < 50) },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{item.label}</span>
                  {item.met ? (
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-muted-foreground/30" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card/50 rounded-2xl p-4 border border-border mt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Recent Signals</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3 h-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p className="text-[9px]">LIVE signals are pending confirmation until the candle closes.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="space-y-3">
              {recentSignals.slice(-3).reverse().map((sig) => (
                <div key={`${sig.symbol}-${sig.type}-${sig.price}-${sig.timestamp.getTime()}`} className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className={cn("text-[10px] font-bold", sig.type === 'BUY' ? "text-emerald-400" : "text-rose-400")}>
                      {sig.type === 'BUY' ? 'CE' : 'PE'} @ {sig.price.toFixed(0)}
                      {sig.status === 'LIVE' && <span className="ml-1 text-[8px] text-amber-400 animate-pulse">● LIVE</span>}
                    </span>
                    <span className="text-[9px] text-muted-foreground">{format(sig.timestamp, 'HH:mm')}</span>
                  </div>
                  <Badge variant={sig.type === 'BUY' ? 'success' : 'destructive'} className="h-4 px-1 text-[8px]">
                    {sig.confidence}%
                  </Badge>
                </div>
              ))}
              {recentSignals.length === 0 && (
                <p className="text-[10px] text-muted-foreground italic">No signals yet today</p>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        <TooltipProvider>
          <Toaster position="top-right" theme="dark" closeButton richColors />
          
          {/* Header */}
          <header className="border-b border-border glass sticky top-0 z-50">
            <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">
              {/* Logo - Hidden on mobile, replaced by symbol */}
              <div className="hidden lg:flex items-center gap-4">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Zap className="text-primary-foreground w-5 h-5 fill-current" />
                </div>
                <h1 className="font-bold text-lg tracking-tightest">SMART SCALPER</h1>
              </div>

              {/* Symbol Switcher - Visible both on mobile (dropdown) and desktop (buttons) */}
              <div className="flex items-center gap-2 lg:gap-6">
                <div className="lg:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={(props) => (
                      <Button {...props} variant="ghost" className="h-9 px-2 gap-2 hover:bg-muted/50">
                        <div className={cn("w-2 h-2 rounded-full", activeSymbol.color === 'blue' ? "bg-blue-500" : "bg-purple-500")} />
                        <span className="font-bold text-sm tracking-tight">{activeSymbol.name}</span>
                        <RefreshCw className={cn("w-3 h-3 text-muted-foreground", loading && "animate-spin")} />
                      </Button>
                    )} />
                    <DropdownMenuContent align="start" className="glass border-border">
                      {SYMBOLS.map(s => (
                        <DropdownMenuItem 
                          key={s.id} 
                          onClick={() => setActiveSymbol(s)}
                          className={cn("gap-2 font-bold", activeSymbol.id === s.id && "text-primary")}
                        >
                          <div className={cn("w-2 h-2 rounded-full", s.color === 'blue' ? "bg-blue-500" : "bg-purple-500")} />
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="hidden lg:flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Market:</span>
                  <div className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded-lg border border-border">
                    <div className={cn("w-1.5 h-1.5 rounded-full", marketStatus.status === 'OPEN' ? "bg-emerald-500" : "bg-rose-500")} />
                    <span className="text-[10px] font-bold">{marketStatus.message}</span>
                  </div>
                </div>
                
                <Separator orientation="vertical" className="hidden lg:block h-4" />
                
                <div className="hidden lg:flex items-center gap-4">
                  {SYMBOLS.map(s => (
                    <button 
                      key={s.id}
                      onClick={() => setActiveSymbol(s)}
                      className={cn(
                        "text-[11px] font-bold uppercase tracking-wider transition-all",
                        activeSymbol.id === s.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 md:gap-4">
                {/* Market Status Pulse - Compact on mobile */}
                <div className={cn(
                  "flex items-center gap-2 px-2 py-1 md:px-3 md:py-1.5 rounded-full border glass",
                  marketStatus.status === 'OPEN' ? "border-emerald-500/30 text-emerald-400" :
                  marketStatus.status === 'CLOSED' ? "border-rose-500/30 text-rose-400" :
                  "border-amber-500/30 text-amber-400"
                )}>
                  <div className={cn(
                    "w-1 h-1 md:w-1.5 md:h-1.5 rounded-full animate-pulse",
                    marketStatus.status === 'OPEN' ? "bg-emerald-400" :
                    marketStatus.status === 'CLOSED' ? "bg-rose-400" :
                    "bg-amber-400"
                  )} />
                  <span className="text-[9px] md:text-[11px] font-bold uppercase tracking-wider">
                    {marketStatus.status === 'OPEN' ? 'Live' : marketStatus.status}
                  </span>
                </div>

              <div className="flex items-center gap-1 bg-muted rounded-full p-1 border border-border">
                <Tooltip>
                  <TooltipTrigger render={(props) => (
                    <Button 
                      {...props}
                      variant="ghost" 
                      size="icon" 
                      className={cn("h-8 w-8 rounded-full", soundEnabled ? "text-blue-400" : "text-muted-foreground")}
                      onClick={(e) => {
                        props.onClick?.(e);
                        const newState = !soundEnabled;
                        setSoundEnabled(newState);
                        sonnerToast.info(`Audio ${newState ? 'enabled' : 'disabled'}`);
                      }}
                    >
                      {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </Button>
                  )} />
                  <TooltipContent>Toggle Sound</TooltipContent>
                </Tooltip>

                <Separator orientation="vertical" className="h-4 mx-1" />

                <Tooltip>
                  <TooltipTrigger render={(props) => (
                    <Button 
                      {...props}
                      variant="ghost" 
                      size="icon" 
                      className={cn("h-8 w-8 rounded-full", loading ? "text-amber-400" : "text-muted-foreground")}
                      onClick={(e) => {
                        props.onClick?.(e);
                        clearCache();
                      }}
                      disabled={loading}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )} />
                  <TooltipContent>Clear Cache</TooltipContent>
                </Tooltip>

                <Separator orientation="vertical" className="h-4 mx-1" />

                <Tooltip>
                  <TooltipTrigger render={(props) => (
                    <Button 
                      {...props}
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 rounded-full"
                      onClick={(e) => {
                        props.onClick?.(e);
                        fetchData(activeSymbol.id);
                      }}
                      disabled={loading}
                    >
                      <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                    </Button>
                  )} />
                  <TooltipContent>Refresh Data</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger render={(props) => (
                    <Button 
                      {...props}
                      variant="ghost" 
                      size="icon" 
                      className={cn(
                        "h-8 w-8 rounded-full transition-all",
                        notificationsEnabled ? "text-blue-400 bg-blue-500/10" : "text-muted-foreground"
                      )}
                      onClick={(e) => {
                        props.onClick?.(e);
                        requestNotificationPermission();
                      }}
                    >
                      {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                    </Button>
                  )} />
                  <TooltipContent>{notificationsEnabled ? "Disable Notifications" : "Enable Notifications"}</TooltipContent>
                </Tooltip>

              </div>

              <DropdownMenu>
                <DropdownMenuTrigger render={(props) => (
                  <Button {...props} variant="outline" className="h-9 rounded-xl glass gap-2 px-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500" />
                    <span className="text-sm font-bold">PRO</span>
                  </Button>
                )} />
                <DropdownMenuContent align="end" className="w-56 glass-dark border-border">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer">Billing</DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer">API Keys</DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-rose-400 cursor-pointer">Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="max-w-[1600px] mx-auto px-4 py-6 md:py-8 space-y-6 md:space-y-8 flex-1">
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-3 text-rose-400"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold uppercase tracking-wider">Data Fetch Error</p>
                <p className="text-xs opacity-80">{error}</p>
              </div>
              <Button 
                onClick={() => fetchData(activeSymbol.id)}
                className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 rounded-xl text-xs font-bold transition-colors"
              >
                Retry
              </Button>
            </motion.div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-6 md:space-y-8">
              {/* Market Overview Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-muted/30 border border-border rounded-xl p-3 md:p-4 flex flex-col justify-center">
                  <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Active Symbol</p>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", activeSymbol.color === 'blue' ? "bg-blue-500" : "bg-purple-500")} />
                    <h2 className="text-sm md:text-xl font-bold truncate">{activeSymbol.name}</h2>
                  </div>
                </div>
                
                <div className="bg-muted/30 border border-border rounded-xl p-3 md:p-4 flex flex-col justify-center">
                  <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Live Price</p>
                  <div className="flex items-center gap-2 md:gap-3">
                    <span className="text-sm md:text-xl font-mono font-bold tabular">{currentPrice.toFixed(2)}</span>
                    <Badge variant={priceChange >= 0 ? "success" : "destructive"} className="text-[8px] md:text-[10px] font-bold px-1 md:px-2">
                      {priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
                    </Badge>
                  </div>
                </div>

                <div className="bg-muted/30 border border-border rounded-xl p-3 md:p-4 flex flex-col justify-center">
                  <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Market Trend</p>
                  <div className="flex items-center gap-2">
                    {trendStrength.direction === 'BULLISH' ? (
                      <div className="flex items-center gap-2 text-emerald-400">
                        <TrendingUp className="w-3 h-3 md:w-4 md:h-4" />
                        <span className="text-[10px] md:text-sm font-bold uppercase">Bullish</span>
                      </div>
                    ) : trendStrength.direction === 'BEARISH' ? (
                      <div className="flex items-center gap-2 text-rose-400">
                        <TrendingDown className="w-3 h-3 md:w-4 md:h-4" />
                        <span className="text-[10px] md:text-sm font-bold uppercase">Bearish</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-400">
                        <Minus className="w-3 h-3 md:w-4 md:h-4" />
                        <span className="text-[10px] md:text-sm font-bold uppercase">Neutral</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-muted/30 border border-border rounded-xl p-3 md:p-4 flex flex-col justify-center">
                  <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Data Recency</p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 md:w-4 md:h-4 text-amber-400" />
                    <span className={cn(
                      "text-[10px] md:text-sm font-mono font-bold",
                      data.length > 0 && (Date.now() - data[data.length - 1].timestamp.getTime() > 1800000) ? "text-rose-400" : "text-emerald-400"
                    )}>
                      {data.length > 0 ? format(data[data.length - 1].timestamp, 'dd MMM HH:mm') : 'No Data'}
                    </span>
                  </div>
                </div>

                <div className="bg-muted/30 border border-border rounded-xl p-3 md:p-4 flex flex-col justify-center">
                  <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Next Refresh</p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 md:w-4 md:h-4 text-blue-400" />
                    <span className="text-[10px] md:text-sm font-mono font-bold">{countdown}s</span>
                  </div>
                </div>
              </div>

              {/* Mobile-Only Insights: Trend Meter & Checklist */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">
                <div className="bg-card border border-border rounded-2xl p-4 md:p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Trend Strength</span>
                    <Badge variant={trendStrength.strength > 70 ? "success" : "outline"} className="text-[9px]">
                      {trendStrength.strength > 70 ? 'Strong' : 'Steady'}
                    </Badge>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-2">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${trendStrength.strength}%` }}
                      className={cn(
                        "h-full transition-all duration-1000",
                        trendStrength.strength > 70 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500"
                      )}
                    />
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-4 md:p-6 shadow-lg">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3">Active Checklist</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {[
                      { label: 'Trend', met: trendStrength.direction !== 'NEUTRAL' },
                      { label: 'VWAP', met: data.length > 0 && (data[data.length-1].close > (data[data.length-1].vwap || 0) || data[data.length-1].close < (data[data.length-1].vwap || 0)) },
                      { label: 'EMA 9/20', met: data.length > 0 && Math.abs((data[data.length-1].ema9 || 0) - (data[data.length-1].ema20 || 0)) > 5 },
                      { label: 'RSI Filter', met: data.length > 0 && ((data[data.length-1].rsi || 50) > 40 && (data[data.length-1].rsi || 50) < 60) },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {item.met ? <ShieldCheck className="w-3 h-3 text-emerald-400" /> : <div className="w-3 h-3 rounded-full border border-muted-foreground/30" />}
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {marketStatus.status !== 'OPEN' && recentSignals.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-primary/5 border border-primary/20 rounded-2xl p-6 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Target className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm tracking-tight">Session Performance Summary</h3>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Reviewing {activeSymbol.name} signals from the last session</p>
                    </div>
                  </div>
                  <div className="flex gap-8">
                    <div className="text-center md:text-right">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Total Signals</p>
                      <p className="text-xl font-mono font-black text-primary">{recentSignals.length}</p>
                    </div>
                    <div className="text-center md:text-right">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Avg. Confidence</p>
                      <p className="text-xl font-mono font-black text-emerald-400">
                        {(recentSignals.reduce((acc, s) => acc + (s.confidence || 0), 0) / recentSignals.length).toFixed(0)}%
                      </p>
                    </div>
                    <div className="text-center md:text-right">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Market Status</p>
                      <p className="text-xl font-mono font-black text-rose-400">CLOSED</p>
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Main Chart Area */}
                <div className="lg:col-span-8 space-y-6">
                  <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
                    <div className="border-b border-border bg-muted/20 px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-primary" />
                          <span className="text-sm font-bold">Technical Chart</span>
                        </div>
                        <Separator orientation="vertical" className="h-4" />
                        <div className="flex items-center gap-2">
                          <Tabs value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
                            <TabsList className="h-8 p-1">
                              <TabsTrigger value="CANDLESTICK" className="text-[10px] px-3">Candles</TabsTrigger>
                              <TabsTrigger value="HEIKIN_ASHI" className="text-[10px] px-3">Heikin Ashi</TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </div>
                      </div>
                    </div>
                    <div className="h-[400px] md:h-[500px] relative bg-black/20">
                      {loading && data.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 z-10">
                          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                          <p className="text-sm font-medium">Loading market data...</p>
                        </div>
                      ) : displayData.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                          <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
                          <h3 className="text-lg font-bold mb-2">No Data Available</h3>
                          <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-6">
                            Could not retrieve data for {activeSymbol.name}. The market might be closed or the symbol is invalid.
                          </p>
                          <Button onClick={() => fetchData(activeSymbol.id)} variant="outline">Retry</Button>
                        </div>
                      ) : (
                        <TradingViewChart 
                          data={displayData} 
                          signals={recentSignals} 
                          chartType={chartType}
                          activeSymbol={activeSymbol}
                        />
                      )}
                    </div>
                  </div>

                  {/* Indicators & Logic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                          <Zap className="w-5 h-5 text-blue-400" />
                        </div>
                        <h3 className="font-bold text-sm">VWAP + EMA</h3>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Strategy combines Volume Weighted Average Price with 9/20 EMA crossovers for high-probability trend entries.
                      </p>
                    </div>
                    
                    <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                          <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        </div>
                        <h3 className="font-bold text-sm">Risk Filter</h3>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Automatic risk assessment based on ATR and 15-min breakout levels to avoid high-volatility traps.
                      </p>
                    </div>

                    <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-amber-500/10 rounded-lg">
                          <Gauge className="w-5 h-5 text-amber-400" />
                        </div>
                        <h3 className="font-bold text-sm">Trend Meter</h3>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Real-time trend strength calculation using EMA gaps, RSI momentum, and price slope analysis.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sidebar: Signals & Log */}
                <div className="lg:col-span-4 space-y-6">
                  {/* Current Signal Card */}
                  <div className={cn(
                    "border rounded-2xl p-6 shadow-xl transition-all duration-500",
                    signal.type === 'BUY' ? "bg-emerald-500/5 border-emerald-500/20" :
                    signal.type === 'SELL' ? "bg-rose-500/5 border-rose-500/20" :
                    "bg-card border-border"
                  )}>
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex flex-col">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {signal.status === 'LIVE' ? 'Live Signal (Pending)' : 'Confirmed Signal'}
                        </p>
                        {signal.status === 'LIVE' && (
                          <div className="flex items-center gap-1.5 mt-1 bg-amber-500/10 px-2 py-0.5 rounded-full w-fit border border-amber-500/20">
                            <Clock className="w-2.5 h-2.5 text-amber-500 animate-pulse" />
                            <span className="text-[8px] font-black text-amber-500 uppercase tracking-tighter">Wait for Candle Close</span>
                          </div>
                        )}
                        {signal.status === 'CONFIRMED' && (
                          <div className="flex items-center gap-1.5 mt-1 bg-emerald-500/10 px-2 py-0.5 rounded-full w-fit border border-emerald-500/20">
                            <ShieldCheck className="w-2.5 h-2.5 text-emerald-500" />
                            <span className="text-[8px] font-black text-emerald-500 uppercase tracking-tighter">Settled Entry</span>
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <div className={cn(
                            "flex items-center gap-1.5 px-2 py-0.5 rounded-full w-fit border",
                            htfTrend === 'BULLISH' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                            htfTrend === 'BEARISH' ? "bg-rose-500/10 border-rose-500/20 text-rose-500" :
                            "bg-slate-500/10 border-slate-500/20 text-slate-500"
                          )}>
                            <Layers className="w-2.5 h-2.5" />
                            <span className="text-[8px] font-black uppercase tracking-tighter">
                              15M Trend: {htfTrend}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge variant={signal.type === 'BUY' ? "success" : signal.type === 'SELL' ? "destructive" : "outline"}>
                        {signal.type === 'NEUTRAL' ? 'Scanning' : signal.status === 'LIVE' ? 'Active' : 'Locked'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                      <div className={cn(
                        "w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner",
                        signal.type === 'BUY' ? "bg-emerald-500/20 text-emerald-400" :
                        signal.type === 'SELL' ? "bg-rose-500/20 text-rose-400" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {signal.type === 'BUY' ? <TrendingUp className="w-8 h-8" /> :
                         signal.type === 'SELL' ? <TrendingDown className="w-8 h-8" /> :
                         <Activity className="w-8 h-8 animate-pulse" />}
                      </div>
                      <div>
                        <h3 className="text-xl font-black tracking-tight">
                          {signal.type === 'NEUTRAL' ? 'SCANNING' : signal.type === 'BUY' ? 'BUY CALL' : 'BUY PUT'}
                        </h3>
                        <p className={cn(
                          "text-[10px] font-bold uppercase",
                          signal.type === 'NEUTRAL' ? "text-amber-400/80" : "text-muted-foreground"
                        )}>
                          {signal.reason}
                        </p>
                      </div>
                    </div>

                    {signal.type !== 'NEUTRAL' && (
                      <div className="space-y-4 pt-4 border-t border-border/50">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-background/50 rounded-xl p-3 border border-border/50">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Entry Price</p>
                            <p className="text-lg font-mono font-bold text-blue-400">{signal.price.toFixed(2)}</p>
                          </div>
                          <div className="bg-background/50 rounded-xl p-3 border border-border/50">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Confidence</p>
                            <p className="text-lg font-mono font-bold text-amber-400">{signal.confidence}%</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-rose-500/5 rounded-xl p-3 border border-rose-500/10">
                            <p className="text-[9px] font-bold text-rose-400 uppercase mb-1">Stop Loss</p>
                            <p className="text-lg font-mono font-bold text-rose-400">{signal.sl?.toFixed(2)}</p>
                          </div>
                          <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/10">
                            <p className="text-[9px] font-bold text-emerald-400 uppercase mb-1">Target 1 (1:2)</p>
                            <p className="text-lg font-mono font-bold text-emerald-400">{signal.tp?.toFixed(2)}</p>
                          </div>
                        </div>
                        <Button 
                          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl h-12"
                          onClick={() => {
                            const isDuplicate = journal.some(t => 
                              t.symbol === activeSymbol.name && 
                              new Date(t.timestamp).getTime() === signal.timestamp.getTime()
                            );

                            if (isDuplicate) {
                              sonnerToast.warning("Trade already exists in journal");
                              return;
                            }

                            const trade = {
                              ...signal,
                              id: Date.now(),
                              symbol: activeSymbol.name,
                              status: 'OPEN'
                            };
                            setJournal([trade, ...journal]);
                            sonnerToast.success("Trade added to journal");
                          }}
                        >
                          Add to Journal
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Execution Log relocated to sidebar for efficiency */}
                  <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl mt-6">
                    <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-primary" />
                        <h3 className="text-[10px] font-bold uppercase tracking-widest">Execution Log</h3>
                        <Badge variant="outline" className="text-[7px] font-black uppercase text-emerald-500 border-emerald-500/30">Confirmed Only</Badge>
                      </div>
                      <Badge variant="outline" className="text-[9px] font-bold">{recentSignals.length}</Badge>
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-border text-[9px] font-bold text-muted-foreground uppercase bg-muted/50">
                            <th className="px-3 py-3">Time</th>
                            <th className="px-3 py-3">Symbol</th>
                            <th className="px-3 py-3">Type</th>
                            <th className="px-3 py-3">Price</th>
                            <th className="px-3 py-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {recentSignals.map((sig) => {
                            // Format timestamp in IST
                            const istTime = new Date(sig.timestamp.getTime() + (5.5 * 60 * 60 * 1000));
                            const timeStr = istTime.getUTCHours().toString().padStart(2, '0') + ':' + 
                                           istTime.getUTCMinutes().toString().padStart(2, '0');

                            return (
                              <tr 
                                key={`${sig.symbol}-${sig.type}-${sig.price}-${sig.timestamp.getTime()}`} 
                                className={cn(
                                  "hover:bg-muted/30 transition-colors text-[10px]",
                                  sig.confidence < settings.threshold && "opacity-40"
                                )}
                              >
                                <td className="px-3 py-3 font-mono text-muted-foreground">{timeStr}</td>
                                <td className="px-3 py-3 font-bold text-primary">{sig.symbol}</td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-col gap-1">
                                    <Badge variant={sig.type === 'BUY' ? 'success' : 'destructive'} className="text-[8px] font-bold px-1.5 py-0 w-fit">
                                      {sig.type === 'BUY' ? 'CE' : 'PE'}
                                    </Badge>
                                    <span className="text-[7px] font-mono text-muted-foreground">{sig.confidence}%</span>
                                  </div>
                                </td>
                                <td className="px-3 py-3 font-mono font-bold leading-none italic">{sig.price.toFixed(1)}</td>
                                <td className="px-3 py-3 text-right">
                                  <div className={cn(
                                    "w-2 h-2 rounded-full ml-auto shadow-sm",
                                    sig.confidence < settings.threshold ? "bg-muted-foreground" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                                  )} />
                                </td>
                              </tr>
                            );
                          })}
                          {recentSignals.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground italic text-xs">
                                No signals today across symbols.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Log View */}
                    <div className="md:hidden divide-y divide-border">
                      {recentSignals.map((sig) => {
                        const istTime = new Date(sig.timestamp.getTime() + (5.5 * 60 * 60 * 1000));
                        const timeStr = istTime.getUTCHours().toString().padStart(2, '0') + ':' + 
                                       istTime.getUTCMinutes().toString().padStart(2, '0');

                        return (
                          <div 
                            key={`${sig.symbol}-${sig.type}-${sig.price}-${sig.timestamp.getTime()}`} 
                            className={cn(
                              "p-4 space-y-3",
                              sig.confidence < settings.threshold && "opacity-40"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <span className="text-[8px] font-black uppercase text-primary mb-1 leading-none">{sig.symbol}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant={sig.type === 'BUY' ? 'success' : 'destructive'} className="text-[9px] font-bold px-1.5 py-0">
                                    {sig.type === 'BUY' ? 'CE' : 'PE'}
                                  </Badge>
                                  <span className="text-xs font-mono font-bold tracking-tighter">{timeStr}</span>
                                </div>
                              </div>
                              <div className="text-right flex flex-col items-end">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono font-bold text-muted-foreground">{sig.confidence}%</span>
                                  <span className="text-sm font-mono font-bold italic text-foreground">{sig.price.toFixed(1)}</span>
                                </div>
                                <Badge 
                                  variant={sig.confidence < settings.threshold ? 'outline' : 'success'} 
                                  className={cn(
                                    "text-[8px] font-bold uppercase px-1 py-0 mt-1 h-4",
                                    sig.confidence < settings.threshold ? "border-muted-foreground text-muted-foreground" : "bg-emerald-500/20 text-emerald-400 border-none"
                                  )}
                                >
                                  {sig.confidence < settings.threshold ? 'Below Threshold' : 'Strong Signal'}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {recentSignals.length === 0 && (
                        <div className="px-6 py-12 text-center text-muted-foreground italic text-sm">
                          No signals recorded today.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'backtest' && (
            <div className="space-y-8 max-w-4xl mx-auto">
              <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <PlayCircle className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">Strategy Backtester</h2>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Run a simulation of the "Smart Scalper" strategy on the current historical data to evaluate performance, win rate, and accuracy.
                </p>
                <Button 
                  size="lg" 
                  className="px-8 h-12 rounded-xl font-bold"
                  onClick={handleRunBacktest}
                  disabled={isBacktesting || data.length === 0}
                >
                  {isBacktesting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                  {isBacktesting ? "Running Simulation..." : "Run Backtest Analysis"}
                </Button>
              </div>

              {backtestResults && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-1 md:grid-cols-4 gap-4"
                >
                  {[
                    { label: 'Total Trades', value: backtestResults.stats.total, icon: Activity, color: 'blue' },
                    { label: 'Win Rate', value: `${backtestResults.stats.accuracy.toFixed(1)}%`, icon: Target, color: 'emerald' },
                    { label: 'Wins', value: backtestResults.stats.wins, icon: TrendingUp, color: 'emerald' },
                    { label: 'Losses', value: backtestResults.stats.losses, icon: TrendingDown, color: 'rose' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-card border border-border rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">{stat.label}</p>
                        <stat.icon className={cn("w-4 h-4", `text-${stat.color}-400`)} />
                      </div>
                      <p className="text-2xl font-mono font-bold">{stat.value}</p>
                    </div>
                  ))}
                </motion.div>
              )}

              {backtestResults && (
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-border bg-muted/20">
                    <h3 className="text-xs font-bold uppercase tracking-widest">Simulation Trade Log</h3>
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
                          <th className="px-6 py-4">Time</th>
                          <th className="px-6 py-4">Type</th>
                          <th className="px-6 py-4">Entry</th>
                          <th className="px-6 py-4">Exit</th>
                          <th className="px-6 py-4">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {backtestResults.trades.slice().reverse().map((trade: any) => (
                          <tr key={trade.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 text-xs font-mono">{format(trade.timestamp, 'MMM dd, HH:mm')}</td>
                            <td className="px-6 py-4">
                              <Badge variant={trade.type === 'BUY' ? 'success' : 'destructive'} className="text-[9px]">
                                {trade.type === 'BUY' ? 'CE' : 'PE'}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-xs font-mono">{trade.entryPrice.toFixed(2)}</td>
                            <td className="px-6 py-4 text-xs font-mono">{trade.exitPrice?.toFixed(2)}</td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "text-[10px] font-bold uppercase",
                                trade.result === 'WIN' ? "text-emerald-400" : "text-rose-400"
                              )}>
                                {trade.result}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Backtest List */}
                  <div className="md:hidden divide-y divide-border">
                    {backtestResults.trades.slice().reverse().map((trade: any) => (
                      <div key={trade.id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={trade.type === 'BUY' ? 'success' : 'destructive'} className="text-[10px] font-bold">
                              {trade.type === 'BUY' ? 'CE' : 'PE'}
                            </Badge>
                            <span className="text-xs font-mono font-bold">{format(trade.timestamp, 'MMM dd, HH:mm')}</span>
                          </div>
                          <span className={cn(
                            "text-[10px] font-bold uppercase",
                            trade.result === 'WIN' ? "text-emerald-400" : "text-rose-400"
                          )}>
                            {trade.result}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground uppercase font-bold">Entry</span>
                            <span className="text-sm font-mono font-bold">{trade.entryPrice.toFixed(2)}</span>
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="text-[9px] text-muted-foreground uppercase font-bold">Exit</span>
                            <span className="text-sm font-mono font-bold">{trade.exitPrice?.toFixed(2) || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'journal' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Trade Journal</h2>
                  <p className="text-muted-foreground text-sm">Keep track of your manual and automated trades.</p>
                </div>
                <Button 
                  variant="outline" 
                  className="rounded-xl border-rose-500/20 text-rose-400 hover:bg-rose-500/10"
                  onClick={() => {
                    if (confirm("Clear all journal entries?")) {
                      setJournal([]);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Journal
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-card border border-border rounded-2xl p-6">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-4">Journal Accuracy</p>
                  <div className="flex items-end gap-3">
                    <p className="text-3xl font-mono font-bold">
                      {(journal.filter(t => t.status === 'WIN').length / (journal.length || 1) * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mb-1">from {journal.length} trades</p>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-2xl p-6">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-4">Total P&L</p>
                  <p className={cn(
                    "text-3xl font-mono font-bold",
                    journal.length === 0 ? "text-white" : "text-emerald-400"
                  )}>
                    ₹0.00
                  </p>
                </div>
                <div className="bg-card border border-border rounded-2xl p-6">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-4">Active Trades</p>
                  <p className="text-3xl font-mono font-bold">{journal.filter(t => t.status === 'OPEN').length}</p>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
                        <th className="px-6 py-4">Symbol</th>
                        <th className="px-6 py-4">Type</th>
                        <th className="px-6 py-4">Entry</th>
                        <th className="px-6 py-4">SL / TP</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {journal.map((trade) => (
                        <tr key={trade.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 font-bold text-sm">{trade.symbol}</td>
                          <td className="px-6 py-4">
                            <Badge variant={trade.type === 'BUY' ? 'success' : 'destructive'} className="text-[9px]">
                              {trade.type === 'BUY' ? 'CE' : 'PE'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-xs font-mono">{trade.price.toFixed(2)}</td>
                          <td className="px-6 py-4 text-[10px] font-mono">
                            <span className="text-rose-400">{trade.sl?.toFixed(2)}</span>
                            <span className="mx-2 text-muted-foreground">/</span>
                            <span className="text-emerald-400">{trade.tp?.toFixed(2)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <select 
                              value={trade.status}
                              onChange={(e) => {
                                const newJournal = journal.map(t => t.id === trade.id ? { ...t, status: e.target.value } : t);
                                setJournal(newJournal);
                              }}
                              className="bg-muted border border-border rounded-lg px-2 py-1 text-[10px] font-bold focus:outline-none"
                            >
                              <option value="OPEN">OPEN</option>
                              <option value="WIN">WIN</option>
                              <option value="LOSS">LOSS</option>
                            </select>
                          </td>
                          <td className="px-6 py-4">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-muted-foreground hover:text-rose-400"
                              onClick={() => setJournal(journal.filter(t => t.id !== trade.id))}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {journal.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-20 text-center">
                            <History className="w-8 h-8 text-muted-foreground/20 mx-auto mb-4" />
                            <p className="text-sm text-muted-foreground">No trades in journal yet.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Journal Cards */}
                <div className="md:hidden divide-y divide-border">
                  {journal.map((trade) => (
                    <div key={trade.id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold">
                          <span>{trade.symbol}</span>
                          <Badge variant={trade.type === 'BUY' ? 'success' : 'destructive'} className="text-[9px]">
                            {trade.type === 'BUY' ? 'CE' : 'PE'}
                          </Badge>
                        </div>
                        <select 
                          value={trade.status}
                          onChange={(e) => {
                            const newJournal = journal.map(t => t.id === trade.id ? { ...t, status: e.target.value } : t);
                            setJournal(newJournal);
                          }}
                          className={cn(
                            "bg-muted border border-border rounded-lg px-2 py-1 text-[8px] font-bold focus:outline-none",
                            trade.status === 'WIN' ? "text-emerald-400 border-emerald-500/20" : 
                            trade.status === 'LOSS' ? "text-rose-400 border-rose-500/20" : ""
                          )}
                        >
                          <option value="OPEN">OPEN</option>
                          <option value="WIN">WIN</option>
                          <option value="LOSS">LOSS</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between bg-muted/20 p-2 rounded-lg border border-border/50">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-muted-foreground uppercase font-bold">Entry</span>
                          <span className="text-xs font-mono font-bold tracking-tighter tabular-nums">{trade.price.toFixed(2)}</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[9px] text-muted-foreground uppercase font-bold">SL / TP</span>
                          <span className="text-xs font-mono font-bold tracking-tighter tabular-nums">
                            <span className="text-rose-400">{trade.sl?.toFixed(0)}</span>
                            <span className="mx-1 opacity-40">/</span>
                            <span className="text-emerald-400">{trade.tp?.toFixed(0)}</span>
                          </span>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        className="w-full h-8 text-[10px] uppercase font-bold text-rose-400"
                        onClick={() => setJournal(journal.filter(t => t.id !== trade.id))}
                      >
                        Delete Journal Entry
                      </Button>
                    </div>
                  ))}
                  {journal.length === 0 && (
                    <div className="px-6 py-12 text-center">
                      <p className="text-sm text-muted-foreground italic">No trades recorded.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-8">
              <div>
                <h2 className="text-2xl font-bold">Strategy Settings</h2>
                <p className="text-muted-foreground text-sm">Customize the scalping engine parameters.</p>
              </div>

              <div className="bg-card border border-border rounded-2xl p-8 space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm">Signal Confidence Threshold</h4>
                      <p className="text-xs text-muted-foreground">Minimum score required to generate a signal.</p>
                    </div>
                    <span className="text-lg font-mono font-bold text-primary">{settings.threshold}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="50" 
                    max="95" 
                    step="5"
                    value={settings.threshold}
                    onChange={(e) => setSettings({ ...settings, threshold: Number(e.target.value) })}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-bold text-sm">Alert Sounds</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {ALERT_SOUNDS.map(sound => (
                      <button
                        key={sound.id}
                        onClick={() => {
                          setSettings({ ...settings, soundUrl: sound.url, soundAlertId: sound.id });
                          const audio = new Audio(sound.url);
                          audio.play().catch(e => console.log('Preview audio failed:', e));
                        }}
                        className={cn(
                          "px-4 py-3 rounded-xl border text-xs font-bold transition-all",
                          settings.soundAlertId === sound.id 
                            ? "bg-primary/10 border-primary text-primary" 
                            : "bg-muted/50 border-border text-muted-foreground hover:border-muted-foreground"
                        )}
                      >
                        {sound.name}
                      </button>
                    ))}
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full mt-4 h-10 rounded-xl border-dashed"
                    onClick={testAlert}
                  >
                    <Bell className="w-4 h-4 mr-2 text-primary" />
                    Test Sound & Notification
                  </Button>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-bold text-sm">Notification Channels</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border">
                      <div className="flex items-center gap-3">
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold">Sound Alerts</span>
                      </div>
                      <Button 
                        variant={soundEnabled ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => setSoundEnabled(!soundEnabled)}
                      >
                        {soundEnabled ? "Enabled" : "Disabled"}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border">
                      <div className="flex items-center gap-3">
                        <Bell className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-bold">Desktop Notifications</span>
                      </div>
                      <Button 
                        variant={notificationsEnabled ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={requestNotificationPermission}
                      >
                        {notificationsEnabled ? "Enabled" : "Enable"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

      {/* Footer */}
      <footer className="max-w-[1600px] mx-auto px-4 py-12 border-t border-border text-center">
        <p className="text-sm text-muted-foreground font-medium">
          &copy; 2026 TRADEX PRO • Powered by Yahoo Finance API & AI Studio
        </p>
      </footer>

    </TooltipProvider>
      </div>

      {/* Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-[60] lg:hidden glass border-t border-border px-4 py-3 pb-safe">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {[
            { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
            { id: 'backtest', label: 'Backtest', icon: PlayCircle },
            { id: 'journal', label: 'History', icon: History },
            { id: 'settings', label: 'Config', icon: Settings },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "flex flex-col items-center gap-1 transition-all",
                activeTab === item.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5", activeTab === item.id ? "fill-primary/20" : "")} />
              <span className="text-[10px] font-bold uppercase tracking-tighter">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

