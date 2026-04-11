import { backTestConfig, config } from ".";
import { hasActiveTrade, orderCustom } from "./bingx";
import { getLast1000andles, getHistoricalData } from "./old/historical";
import { EMA, VWAP, RSI, ATR, RISK, ICandle } from "./old/math"; // أضفنا TimeFilter

export const algo = async () => {
    if(config.mode === "backtest") {
        throw new Error("algo.getTradeLevels should not be called in backtest mode");
    }
    console.log("🚀 Starting algo...");
    const run = async () => {
        try {
            const hasTrade = await hasActiveTrade();
            if (hasTrade) {
                console.log("🔗 On Trade");
                return;
            } else {
                console.log("🔍 Scanning For New Trade Opportunities...");
            }
            const historicalCandles = await getLast1000andles(config.chartIntrval as "1m" | "15m" | "1h");
            const tradeLevels = getTradeLevels(historicalCandles);
            if(!tradeLevels) {
                return;
            }
            await orderCustom(
                tradeLevels.entryPrice, 
                "LONG", 
                tradeLevels.takeProfit, 
                tradeLevels.stopLoss
            );
            

        } catch (error) {
            console.error("Error in algo run:", error);
        }
    }

    // تشغيل فوري عند البدء
    await run();

    // تشغيل كل دقيقة بشكل آمن
    setInterval(async () => {
        await run();
    }, 1000 * 30);
}




interface ActiveTradeBackTest {
    entryPrice: number;
    takeProfit: number;
    stopLoss: number;
    type: "LONG" | "SHORT";
}

export const backTestAlgo = async () => {
    console.log("⏳ Starting Backtest...");
    
    // افتراض أن هذه الدالة تجلب الـ 512 ألف شمعة
    const now = Date.now();
    const fifteenDaysAgo = now - (15 * 24 * 60 * 60 * 1000);
    
    // جلب البيانات
    let c = await getHistoricalData(
        "1m", 
        fifteenDaysAgo, 
        now, 
        `candles_${config.symbol}_1m_last15days.json`
    );
    
    c.reverse();
    let activeTrade: ActiveTradeBackTest | null = null;
    let pendingOrder: ActiveTradeBackTest | null = null; // إضافة متغير الأوردر المعلق

    let stats = {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        highestWallet: backTestConfig.wallet,
        lowestWallet: backTestConfig.wallet,
    };
    for (let i = 1000; i < c.length; i++) {
        const currentCandle = c[i];
        let pendingOrderAge = 0; 
        let tradeJustOpened = false; // 👈 إضافة هذا المتغير لمنع إغلاق الصفقة في نفس الشمعة

        // 1. معالجة الأوامر المعلقة
        if (pendingOrder && !activeTrade) {
            pendingOrderAge++; 

            if (currentCandle.low <= pendingOrder.entryPrice) {
                activeTrade = pendingOrder;
                pendingOrder = null;
                pendingOrderAge = 0; 
                stats.totalTrades++;
                tradeJustOpened = true; // 👈 الصفقة فتحت للتو

                // 🔍 طباعة أول 3 صفقات لفهم الأرقام المجهرية
                if (stats.totalTrades <= 3) {
                    console.log(`\n[Trade ${stats.totalTrades}] OPENED!`);
                    console.log(`Entry: ${activeTrade.entryPrice.toFixed(4)} | SL: ${activeTrade.stopLoss.toFixed(4)} | TP: ${activeTrade.takeProfit.toFixed(4)}`);
                    console.log(`SL Distance: ${(activeTrade.entryPrice - activeTrade.stopLoss).toFixed(4)} USD`);
                }
            } 
            else if (currentCandle.close > pendingOrder.entryPrice * 1.01 || pendingOrderAge > 30) {
                pendingOrder = null;
                pendingOrderAge = 0; 
            }
        }

        // 2. إدارة الصفقة المفتوحة (لن تعمل في نفس شمعة الدخول)
        if (activeTrade && !tradeJustOpened) { 
            let isClosed = false;
            let pnl = 0;

            const positionSizeUsd = backTestConfig.usdtPerTrade * backTestConfig.leverage;
            const quantity = positionSizeUsd / activeTrade.entryPrice; 

            // فحص ضرب الستوب لوس أو التيك بروفيت
            if (activeTrade.type === "LONG") {
                if (currentCandle.low <= activeTrade.stopLoss) {
                    pnl = (activeTrade.stopLoss - activeTrade.entryPrice) * quantity;
                    stats.losses++;
                    isClosed = true;
                    if (stats.totalTrades <= 3) console.log(`[Trade ${stats.totalTrades}] ❌ LOST at candle low: ${currentCandle.low}`);
                } 
                else if (currentCandle.high >= activeTrade.takeProfit) {
                    pnl = (activeTrade.takeProfit - activeTrade.entryPrice) * quantity;
                    stats.wins++;
                    isClosed = true;
                    if (stats.totalTrades <= 3) console.log(`[Trade ${stats.totalTrades}] ✅ WON at candle high: ${currentCandle.high}`);
                }
            }

            if (isClosed) {
                const fees = positionSizeUsd * backTestConfig.tradeTotalFees; 
                backTestConfig.wallet += (pnl - fees);
                
                if (backTestConfig.wallet > stats.highestWallet) stats.highestWallet = backTestConfig.wallet;
                if (backTestConfig.wallet < stats.lowestWallet) stats.lowestWallet = backTestConfig.wallet;
                
                activeTrade = null; 

                if (backTestConfig.wallet <= 0) {
                    console.log("💀 REKT! Wallet is empty. Stopping backtest.");
                    break;
                }
            }
            continue;
        }

        // 3. البحث عن صفقات جديدة
        if (!activeTrade && !pendingOrder) {
            const historicalCandles = c.slice(i - 1000, i);
            const tradeSignal = getTradeLevels(historicalCandles);

            if (tradeSignal) {
                pendingOrder = {
                    entryPrice: tradeSignal.entryPrice,
                    takeProfit: tradeSignal.takeProfit,
                    stopLoss: tradeSignal.stopLoss,
                    type: "LONG" 
                };
            }
        }
    }

    // 3. طباعة النتائج النهائية
    console.log("📊 --- Backtest Results ---");
    console.log(`Initial Wallet: $100.00`);
    console.log(`Final Wallet  : $${backTestConfig.wallet.toFixed(2)}`);
    console.log(`Total Trades  : ${stats.totalTrades}`);
    console.log(`Wins          : ${stats.wins}`);
    console.log(`Losses        : ${stats.losses}`);
    console.log(`Win Rate      : ${((stats.wins / stats.totalTrades) * 100).toFixed(2)}%`);
    console.log(`Max Wallet    : $${stats.highestWallet.toFixed(2)}`);
    console.log(`Min Wallet    : $${stats.lowestWallet.toFixed(2)}`);
    console.log("----------------------------");
}

const getTradeLevels = (c:ICandle[]) => {

    const historicalCandles = c;
    const todayCandles = historicalCandles
    const lastClose = historicalCandles[historicalCandles.length - 1].close;            
    const currentTrend = EMA.getDualEmaTrend(historicalCandles, 50, 200);
    
    if (currentTrend !== 'Bullish') {
        return;
    }

    const vwapPrice = VWAP.getCurrentVwap(todayCandles);
    const currentAtr = ATR.calculateAtr(historicalCandles, 14);

    const sweepIntensity = config.sweepIntensity;
    const sweepEntryPrice = vwapPrice - (currentAtr * sweepIntensity); 
    
    const preparationTolerance = 0.005; // 0.5%
    
    const distanceToEntry = (lastClose - sweepEntryPrice) / sweepEntryPrice;
    const isNearEntry = Math.abs(distanceToEntry) <= preparationTolerance && lastClose >= (sweepEntryPrice - currentAtr);
    
    const isMomentumReady = RSI.isOversold(historicalCandles, 14, 40);
 
    if (isNearEntry && isMomentumReady) {
        const tradeLevels = RISK.calculateTradeLevels(
            sweepEntryPrice, 
            currentAtr, 
            true, 
            1.5 + sweepIntensity,
            2 + sweepIntensity
        );
        console.log("🎯 SNIPER ENTRY DETECTED (Liquidity Sweep Zone) 🎯");
        return tradeLevels;
    }
}