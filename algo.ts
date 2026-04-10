import { config } from ".";
import { hasActiveTrade, orderCustom } from "./bingx";
import { getLast1000andles } from "./old/historical";
import { EMA, VWAP, RSI, ATR, RISK } from "./old/math"; // أضفنا TimeFilter

export const algo = async () => {
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
            const todayCandles = historicalCandles
            
            const currentTrend = EMA.getDualEmaTrend(historicalCandles, 50, 200);
            if (currentTrend !== 'Bullish') {
                return;
            }

            const vwapPrice = VWAP.getCurrentVwap(todayCandles);
            const currentAtr = ATR.calculateAtr(historicalCandles, 14);

            // --- التعديل الجوهري هنا ---
            // نضع سعر الدخول تحت الـ VWAP بنسبة من الـ ATR لاصطياد الـ Sweep
            const sweepIntensity = config.sweepIntensity;
            const sweepEntryPrice = vwapPrice - (currentAtr * sweepIntensity); 
            
            // فحص إذا كان السعر الحالي قريب من "منطقة الاصطياد" وليس الـ VWAP نفسه
            const preparationTolerance = 0.005; // 0.5%
            const lastClose = historicalCandles[historicalCandles.length - 1].close;

            const distanceToEntry = Math.abs(lastClose - sweepEntryPrice) / sweepEntryPrice;
            const isNearEntry = distanceToEntry <= preparationTolerance;
            
            const isMomentumReady = RSI.isOversold(historicalCandles, 14, 30);

            if (isNearEntry && isMomentumReady) {
                
                // حساب SL و TP بناءً على سعر الدخول المنخفض الجديد
                // نزيد معامل الـ SL ليكون أبعد عن منطقة التلاعب
                const tradeLevels = RISK.calculateTradeLevels(
                    sweepEntryPrice, 
                    currentAtr, 
                    true, 
                    1.5 + sweepIntensity,
                    2 + sweepIntensity
                );

                console.log("🎯 SNIPER ENTRY DETECTED (Liquidity Sweep Zone) 🎯");
                
                await orderCustom(
                    tradeLevels.entryPrice, 
                    "LONG", 
                    tradeLevels.takeProfit, 
                    tradeLevels.stopLoss
                );
            }

        } catch (error) {
            console.error("Error in algo run:", error);
        }
    }

    // تشغيل فوري عند البدء
    await run();

    // تشغيل كل دقيقة بشكل آمن
    setInterval(async () => {
        await run();
    }, 1000 * 60);

}