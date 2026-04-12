import { backTestConfig, config } from ".";
import { cancelOldOrders, hasOrders, hasPostions, orderCustom } from "./bingx";
import { getLast1000andles, getHistoricalData } from "./old/historical";
import { EMA, VWAP, RSI, ATR, RISK, ICandle } from "./old/math"; // أضفنا TimeFilter
import { sendTradeNotification } from "./webhook";

export const algo = async () => {
    if(config.mode === "backtest") {
        throw new Error("algo.getTradeLevels should not be called in backtest mode");
    }
    console.log("🚀 Starting algo...");
    const run = async () => {
        try {
            const isHasPostions = await hasPostions();
            if (isHasPostions) {
                console.log("🔗 On Postion");
                return;
            }
            await cancelOldOrders();
            const isHasOrders = await hasOrders();
            if (isHasPostions || isHasOrders) {
                console.log("🔗 There is an order");
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
            await sendTradeNotification({
                type: "LONG",
                entryPrice: tradeLevels.entryPrice,
                takeProfit: tradeLevels.takeProfit,
                stopLoss: tradeLevels.stopLoss
            });
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
    console.log("⏳ Starting REALISTIC Backtest (with Spread & Slippage)...");
    
    const now = Date.now();
    const fifteenDaysAgo = now - (15 * 24 * 60 * 60 * 1000);
    
    let c = await getHistoricalData(
        "1m", 
        fifteenDaysAgo, 
        now, 
        `candles_${config.symbol}_1m_last15days.json`
    );
    
    c.reverse();
    let activeTrade: ActiveTradeBackTest | null = null;
    let pendingOrder: ActiveTradeBackTest | null = null; 

    let stats = {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        highestWallet: backTestConfig.wallet,
        lowestWallet: backTestConfig.wallet,
    };

    // 🚨 إضافة عامل الواقعية: 0.05% سبريد وانزلاق سعري
    const SPREAD_RATE = 0.0005; 

    for (let i = 1000; i < c.length; i++) {
        const currentCandle = c[i];
        let pendingOrderAge = 0; 
        let tradeJustOpened = false; 

        // 1. معالجة الأوامر المعلقة
        if (pendingOrder && !activeTrade) {
            pendingOrderAge++; 

            const isLongTriggered = pendingOrder.type === "LONG" && currentCandle.low <= pendingOrder.entryPrice;

            if (isLongTriggered) {
                activeTrade = pendingOrder;
                pendingOrder = null;
                pendingOrderAge = 0; 
                stats.totalTrades++;

                if (stats.totalTrades <= 5) {
                    console.log(`\n[Trade ${stats.totalTrades}] ${activeTrade.type} OPENED!`);
                }

                // 🚨 التعديل الواقعي لضرب الوقف في نفس الشمعة
                // اللونق ينضرب وقفه أسرع (نضرب السعر في 1 + السبريد) والشورت ينضرب أسرع (نضرب السعر في 1 - السبريد)
                const isLongSlHit = activeTrade.type === "LONG" && currentCandle.low <= activeTrade.stopLoss * (1 + SPREAD_RATE);
                if (isLongSlHit) {
                    const positionSizeUsd = backTestConfig.usdtPerTrade * backTestConfig.leverage;
                    const quantity = positionSizeUsd / activeTrade.entryPrice; 
                    
                    // حساب الخسارة
                    let pnl = activeTrade.type === "LONG" 
                        ? (activeTrade.stopLoss - activeTrade.entryPrice) * quantity
                        : (activeTrade.entryPrice - activeTrade.stopLoss) * quantity; 
                        
                    // إضافة ضريبة الانزلاق للخسارة
                    const slippageCost = positionSizeUsd * SPREAD_RATE;
                    const fees = positionSizeUsd * backTestConfig.tradeTotalFees; 
                    
                    backTestConfig.wallet += (pnl - fees - slippageCost);
                    stats.losses++;
                    
                    if (stats.totalTrades <= 5) console.log(`[Trade ${stats.totalTrades}] ❌ LOST IN THE ENTRY MINUTE (Mark Price Hit)`);
                    
                    activeTrade = null; 
                } else {
                    tradeJustOpened = true; 
                }
            } 
            else if (pendingOrderAge > 30) {
                pendingOrder = null;
                pendingOrderAge = 0; 
            }
        }

        // 2. إدارة الصفقة المفتوحة
        if (activeTrade && !tradeJustOpened) { 
            let isClosed = false;
            let pnl = 0;

            const positionSizeUsd = backTestConfig.usdtPerTrade * backTestConfig.leverage;
            const quantity = positionSizeUsd / activeTrade.entryPrice; 
            const slippageCost = positionSizeUsd * SPREAD_RATE; // تكلفة الانزلاق الواقعية

            // 🟢 فحص اللونق (واقعي)
            if (activeTrade.type === "LONG") {
                if (currentCandle.low <= activeTrade.stopLoss * (1 + SPREAD_RATE)) {
                    // الخسارة = (سعر الخروج الصغير - سعر الدخول الكبير) * الكمية -> بيطلع رقم سالب
                    pnl = (activeTrade.stopLoss - activeTrade.entryPrice) * quantity; 
                    stats.losses++;
                    isClosed = true;
                } 
                else if (currentCandle.high >= activeTrade.takeProfit * (1 - SPREAD_RATE)) {
                    // الربح = (سعر الخروج الكبير - سعر الدخول الصغير) * الكمية -> بيطلع رقم موجب
                    pnl = (activeTrade.takeProfit - activeTrade.entryPrice) * quantity;
                    stats.wins++;
                    isClosed = true;
                }
            }
            // 🔴 فحص الشورت (واقعي)

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
            const tradeLongSignal = getTradeLevels(historicalCandles);
            
            if (tradeLongSignal) {
                pendingOrder = {
                    entryPrice: tradeLongSignal.entryPrice,
                    takeProfit: tradeLongSignal.takeProfit,
                    stopLoss: tradeLongSignal.stopLoss,
                    type: "LONG" 
                };
            }
        }
    }

    // 3. طباعة النتائج النهائية
    console.log("📊 --- REALISTIC Backtest Results ---");
    console.log(`Final Wallet  : $${backTestConfig.wallet.toFixed(2)}`);
    console.log(`Total Trades  : ${stats.totalTrades}`);
    console.log(`Wins          : ${stats.wins}`);
    console.log(`Losses        : ${stats.losses}`);
    console.log(`Win Rate      : ${stats.totalTrades > 0 ? ((stats.wins / stats.totalTrades) * 100).toFixed(2) : 0}%`);
    console.log(`Max Wallet    : $${stats.highestWallet.toFixed(2)}`);
    console.log(`Min Wallet    : $${stats.lowestWallet.toFixed(2)}`);
    console.log("--------------------------------------");
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