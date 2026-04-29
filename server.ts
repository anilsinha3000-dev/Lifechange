import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
// Import the default export as the class and instantiate it
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Health Check
  app.get("/api/health", async (req, res) => {
    try {
      // Try Nifty first, then Reliance as fallback for connection check
      let result;
      try {
        result = await yahooFinance.quote('^NSEI');
      } catch (e) {
        result = await yahooFinance.quote('RELIANCE.NS');
      }
      res.json({ 
        status: "ok", 
        market: "connected", 
        symbol: result.symbol,
        price: result.regularMarketPrice,
        time: result.regularMarketTime 
      });
    } catch (error) {
      console.error("[Health] Connection check failed:", error);
      res.status(500).json({ status: "error", message: "Market connection failed" });
    }
  });

  // Cache for market data to avoid hitting rate limits too hard
  let cache: Record<string, { data: any; timestamp: number }> = {};
  const CACHE_TTL = 10000; // 10 seconds

  app.post("/api/clear-cache", (req, res) => {
    cache = {};
    console.log("[API] Cache cleared by user request");
    res.json({ status: "success", message: "Server cache cleared" });
  });

  app.get("/api/market-data", async (req, res) => {
    const symbol = req.query.symbol as string || '^NSEI';
    const interval = (req.query.interval as any) || '5m';
    const range = (req.query.range as any) || '1d';

    const cacheKey = `${symbol}-${interval}-${range}`;
    if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
      return res.json(cache[cacheKey].data);
    }

    try {
      // Calculate period1 based on range
      const now = Math.floor(Date.now() / 1000);
      let period1: number;
      
      switch (range) {
        case '1d': period1 = now - (7 * 86400); break; // Increased to 7 days for safety (EMAs require history)
        case '5d': period1 = now - (14 * 86400); break; 
        case '1mo': period1 = now - (45 * 86400); break;
        default: period1 = now - (7 * 86400);
      }

      console.log(`[API] Fetching ${symbol} | interval: ${interval} | range: ${range} | period1: ${new Date(period1 * 1000).toISOString()}`);

      let result = await yahooFinance.chart(symbol, {
        period1,
        interval: interval,
      });

      if (!result || !result.quotes || result.quotes.length === 0) {
        console.warn(`[API] No primary quotes for ${symbol}, checking if market is closed or symbol is delayed`);
        // If primary returns nothing, maybe the range was too tight during a weekend? We already increased safety period above.
        throw new Error(`No quotes returned for ${symbol}`);
      }
      
      const validQuotes = result.quotes.filter(q => q.close !== null);
      console.log(`[API] ${symbol}: Received ${result.quotes.length} total, ${validQuotes.length} valid quotes`);
      
      // Fallback for Bank Nifty if ^NSEBANK returns no quotes (Yahoo occasionally has issues with the ^ symbol)
      if (symbol === '^NSEBANK' && validQuotes.length === 0) {
        console.log('[API] ^NSEBANK returned no valid data, trying BANKNIFTY.NS as fallback...');
        result = await yahooFinance.chart('BANKNIFTY.NS', {
          period1,
          interval: interval,
        });
      }

      // Special handling for Nifty symbols if they are significantly stale
      if (symbol === '^NSEI' && validQuotes.length > 0) {
        const lastQuoteTime = new Date(validQuotes[validQuotes.length - 1].date).getTime();
        if (Date.now() - lastQuoteTime > 3600000 * 24) { // More than 24 hours stale
           console.log('[API] ^NSEI is stale, suggesting users check NIFTYBEES.NS for live movement.');
        }
      }
      
      console.log(`Fetched ${result.quotes?.length || 0} quotes for ${symbol}`);
      
      cache[cacheKey] = { data: result, timestamp: Date.now() };
      res.json(result);
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
