export interface ICandle {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    time: number;
}

export interface IRawCandle {
  open: string;
  close: string;
  high: string;
  low: string;
  volume: string;
  time: number;
}
 
export type TrendDirection = 'Bullish' | 'Bearish' | 'Sideways';
function getPriceActionTrend(candles: ICandle[]): TrendDirection {
    if (candles.length < 2) return 'Sideways';
    
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    // Bullish Trend: Higher close and higher low
    if (current.close > prev.close && current.low > prev.low) {
        return 'Bullish';
    }
    // Bearish Trend: Lower close and lower high
    if (current.close < prev.close && current.high < prev.high) {
        return 'Bearish';
    }

    return 'Sideways';
}
function getSmaTrend(candles: ICandle[], period: number = 14): TrendDirection {
    if (candles.length < period) {
        throw new Error("Not enough candles to calculate the required SMA period.");
    }

    // Slice the last candles based on the required period
    const periodCandles = candles.slice(-period);

    // Calculate the sum of closing prices
    const sum = periodCandles.reduce((acc, candle) => acc + candle.close, 0);

    // Calculate the Simple Moving Average
    const sma = sum / period;
    const currentClose = candles[candles.length - 1].close;

    if (currentClose > sma) return 'Bullish';
    if (currentClose < sma) return 'Bearish';

    return 'Sideways';

}

export const SMA = {
    getSmaTrend: getSmaTrend
}

function calculateEma(prices: number[], period: number): number {
    if (prices.length < period) {
        throw new Error("Not enough data to calculate EMA. Provide more candles.");
    }

    // 1. Calculate the Multiplier (Smoothing Constant)
    // Formula: 2 / (period + 1)
    const multiplier = 2 / (period + 1);

    // 2. Calculate the Initial SMA to use as the first EMA base
    const initialSmaPrices = prices.slice(0, period);
    const initialSma = initialSmaPrices.reduce((acc, val) => acc + val, 0) / period;

    // 3. Loop through the remaining prices to calculate EMA
    let currentEma = initialSma;

    // Start calculating from the index right after the initial SMA period
    for (let i = period; i < prices.length; i++) {
        // EMA Formula: (Close - Previous EMA) * Multiplier + Previous EMA
        currentEma = (prices[i] - currentEma) * multiplier + currentEma;
    }

    return currentEma;
}
function getOverallTrend(candles: ICandle[], period: number = 200): TrendDirection {

    const closePrices = candles.map(candle => candle.close);

    const lastEma = calculateEma(closePrices, period);

    const currentClose = closePrices[closePrices.length - 1];

    if (currentClose > lastEma) return 'Bullish';
    if (currentClose < lastEma) return 'Bearish';

    return 'Sideways';
}
function getDualEmaTrend(
    candles: ICandle[], 
    fastPeriod: number = 50, 
    slowPeriod: number = 200
  ): TrendDirection {
    const closePrices = candles.map(candle => candle.close);

    const fastEma = calculateEma(closePrices, fastPeriod);
    const slowEma = calculateEma(closePrices, slowPeriod);

    // Fast EMA above Slow EMA indicates an overall Bullish trend
    if (fastEma > slowEma) return 'Bullish';

    // Fast EMA below Slow EMA indicates an overall Bearish trend
    if (fastEma < slowEma) return 'Bearish';

    return 'Sideways';
}

export const EMA = {
    getDualEmaTrend: getDualEmaTrend,
    getOverallTrend: getOverallTrend
}

function calculateVwap(candles: ICandle[]): number[] {
    if (candles.length === 0) return [];

    let cumulativeVolume = 0;
    let cumulativeVolumePrice = 0;
    const vwapValues: number[] = [];

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];

        // 1. Calculate Typical Price
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;

        // 2. Accumulate Volume
        cumulativeVolume += candle.volume;

        // 3. Accumulate Price * Volume
        cumulativeVolumePrice += typicalPrice * candle.volume;

        // 4. Calculate VWAP for the current candle
        const currentVwap = cumulativeVolumePrice / cumulativeVolume;
        vwapValues.push(currentVwap);
    }

    return vwapValues;
}

function getCurrentVwap(candles: ICandle[]): number {
    const vwapValues = calculateVwap(candles);
    return vwapValues[vwapValues.length - 1];
}

function isNearVwap(candles: ICandle[], tolerancePercentage: number = 0.1): boolean {
    const currentVwap = getCurrentVwap(candles);
    const currentClose = candles[candles.length - 1].close;

    const distanceToVwap = Math.abs(currentClose - currentVwap);
    const percentageDistance = (distanceToVwap / currentVwap) * 100;

    return percentageDistance <= tolerancePercentage;
}

export const VWAP = {
    calculateVwap: calculateVwap,
    getCurrentVwap: getCurrentVwap,
    isNearVwap: isNearVwap
}
function calculateRsi(candles: ICandle[], period: number = 14): number[] {
    if (candles.length < period + 1) {
        throw new Error("Not enough data to calculate RSI. Provide at least period + 1 candles.");
    }

    const gains: number[] = [];
    const losses: number[] = [];

    // 1. Calculate absolute price changes (Gains and Losses)
    for (let i = 1; i < candles.length; i++) {
        const change = candles[i].close - candles[i - 1].close;
        if (change > 0) {
        gains.push(change);
        losses.push(0);
        } else {
        gains.push(0);
        losses.push(Math.abs(change));
        }
    }

    const rsiValues: number[] = [];

    // 2. Calculate Initial Average Gain and Average Loss (Simple Moving Average)
    let avgGain = gains.slice(0, period).reduce((acc, val) => acc + val, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((acc, val) => acc + val, 0) / period;

    // Calculate Initial RSI
    let rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
    let initialRsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    rsiValues.push(initialRsi);

    // 3. Apply Wilder's Smoothing for the rest of the data
    for (let i = period; i < gains.length; i++) {
        avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
        avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;

        if (avgLoss === 0) {
        rsiValues.push(100);
        } else {
        rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        rsiValues.push(rsi);
        }
    }

    return rsiValues;
}

function getCurrentRsi(candles: ICandle[], period: number = 14): number {
    const rsiValues = calculateRsi(candles, period);
    return rsiValues[rsiValues.length - 1];
}
function isOversold(candles: ICandle[], period: number = 14, threshold: number = 30): boolean {
    const currentRsi = getCurrentRsi(candles, period);
    return currentRsi <= threshold;
}
function isOverbought(candles: ICandle[], period: number = 14, threshold: number = 70): boolean {
    const currentRsi = getCurrentRsi(candles, period);
    return currentRsi >= threshold;
}

export const RSI = {
    calculateRsi: calculateRsi,
    isOversold: isOversold,
    getCurrentRsi: getCurrentRsi

}

function calculateTr(current: ICandle, previous: ICandle): number {
    const highLow = current.high - current.low;
    const highPrevClose = Math.abs(current.high - previous.close);
    const lowPrevClose = Math.abs(current.low - previous.close);

    // Returns the maximum of the three values
    return Math.max(highLow, highPrevClose, lowPrevClose);
}

function calculateAtr(candles: ICandle[], period: number = 14): number {
    if (candles.length < period + 1) {
        throw new Error("Not enough data to calculate ATR. Provide at least period + 1 candles.");
    }

    const trValues: number[] = [];

    for (let i = 1; i < candles.length; i++) {
        const tr = calculateTr(candles[i], candles[i - 1]);
        trValues.push(tr);
    }

    // 1. Calculate Initial ATR (Simple Moving Average of the first 'period' TRs)
    const initialTrs = trValues.slice(0, period);
    const initialAtr = initialTrs.reduce((acc, val) => acc + val, 0) / period;

    // 2. Apply Wilder's Smoothing for the remaining TR values
    let currentAtr = initialAtr;
    for (let i = period; i < trValues.length; i++) {
        // Wilder's Formula: ((Previous ATR * (Period - 1)) + Current TR) / Period
        currentAtr = ((currentAtr * (period - 1)) + trValues[i]) / period;
    }

    return currentAtr;
}
function calculateTradeLevels(
    entryPrice: number, 
    atrValue: number, 
    isLong: boolean, // true for Buy (Long), false for Sell (Short)
    atrRiskMultiplier: number = 1.5, 
    riskRewardRatio: number = 2.0
    ) {
    const riskAmount = atrValue * atrRiskMultiplier;
    const rewardAmount = riskAmount * riskRewardRatio;

    let stopLoss: number;
    let takeProfit: number;

    if (isLong) {
        stopLoss = entryPrice - riskAmount;
        takeProfit = entryPrice + rewardAmount;
    } else { // Short Position
        stopLoss = entryPrice + riskAmount;
        takeProfit = entryPrice - rewardAmount;
    }

    return {
        entryPrice,
        stopLoss,
        takeProfit,
        riskDistance: riskAmount,
        rewardDistance: rewardAmount
    };
}
export const ATR = {
    calculateAtr: calculateAtr
}
export const RISK = {
    calculateTradeLevels: calculateTradeLevels
}

export const otherMath = {
    getPriceActionTrend: getPriceActionTrend,
}

// export function getOrderPrice(candles: ICandle[]): number | null {
//     const trend = getTrend(candles);
//     const n = candles.length;

//     // نحتاج عدد كافٍ من الشموع لرصد القمم والقيعان
//     if (trend === 'neutral' || n < 10) return null;

//     // 1. حساب "الـ Buffer" (بعيدة شوي) بشكل ديناميكي 
//     // نحسب متوسط طول الشموع (High - Low) لنجعل المسافة متناسبة مع حركة السوق
//     let totalSize = 0;
//     for (let i = 0; i < n; i++) {
//         totalSize += (candles[i].high - candles[i].low);
//     }
//     const avgCandleSize = totalSize / n;
    
//     // مسافة صيد السيولة = ضعف متوسط حجم الشمعة (يمكنك تعديل الرقم 2 حسب استراتيجيتك)
//     const liquidityBuffer = avgCandleSize * 2; 

//     if (trend === 'up') {
//         /**
//          * في الترند الصاعد: نبحث عن "القاع الذي كون آخر قمة"
//          * 1. نبحث عن أعلى قمة في البيانات
//          * 2. نبحث عن أدنى قاع حدث *قبل* تلك القمة
//          */
        
//         let highestHighIdx = 0;
//         // البحث عن آخر قمة
//         for (let i = 1; i < n; i++) {
//             if (candles[i].high > candles[highestHighIdx].high) {
//                 highestHighIdx = i;
//             }
//         }

//         // إذا كانت القمة هي أول شمعة، لا يمكننا إيجاد قاع قبلها
//         if (highestHighIdx === 0) return null;

//         let lowestLowIdx = 0;
//         // البحث عن القاع الذي سبق هذه القمة
//         for (let i = 1; i <= highestHighIdx; i++) {
//             if (candles[i].low < candles[lowestLowIdx].low) {
//                 lowestLowIdx = i;
//             }
//         }

//         // نقطة الشراء: تحت القاع بشوي (لاقتناص السيولة المضروبة)
//         const targetLow = candles[lowestLowIdx].low;
//         return targetLow - liquidityBuffer;

//     } else if (trend === 'down') {
//         /**
//          * في الترند الهابط: نبحث عن "القمة التي كونت آخر قاع"
//          * 1. نبحث عن أدنى قاع في البيانات
//          * 2. نبحث عن أعلى قمة حدثت *قبل* ذلك القاع
//          */

//         let lowestLowIdx = 0;
//         // البحث عن آخر قاع
//         for (let i = 1; i < n; i++) {
//             if (candles[i].low < candles[lowestLowIdx].low) {
//                 lowestLowIdx = i;
//             }
//         }

//         // إذا كان القاع هو أول شمعة، لا يمكننا إيجاد قمة قبلها
//         if (lowestLowIdx === 0) return null;

//         let highestHighIdx = 0;
//         // البحث عن القمة التي سبقت هذا القاع
//         for (let i = 1; i <= lowestLowIdx; i++) {
//             if (candles[i].high > candles[highestHighIdx].high) {
//                 highestHighIdx = i;
//             }
//         }

//         // نقطة الدخول (البيع المكشوف أو الشراء العكسي): فوق القمة بشوي
//         const targetHigh = candles[highestHighIdx].high;
//         return targetHigh + liquidityBuffer;
//     }

//     return null;
// }