interface ICandle {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    time: number;
}
export function getTrend(candles: ICandle[]): 'up' | 'down' | 'neutral' {
    return "up";
}
export function getOrderPrice(candles: ICandle[]): number | null {
    const trend = getTrend(candles);
    const n = candles.length;

    // نحتاج عدد كافٍ من الشموع لرصد القمم والقيعان
    if (trend === 'neutral' || n < 10) return null;

    // 1. حساب "الـ Buffer" (بعيدة شوي) بشكل ديناميكي 
    // نحسب متوسط طول الشموع (High - Low) لنجعل المسافة متناسبة مع حركة السوق
    let totalSize = 0;
    for (let i = 0; i < n; i++) {
        totalSize += (candles[i].high - candles[i].low);
    }
    const avgCandleSize = totalSize / n;
    
    // مسافة صيد السيولة = ضعف متوسط حجم الشمعة (يمكنك تعديل الرقم 2 حسب استراتيجيتك)
    const liquidityBuffer = avgCandleSize * 2; 

    if (trend === 'up') {
        /**
         * في الترند الصاعد: نبحث عن "القاع الذي كون آخر قمة"
         * 1. نبحث عن أعلى قمة في البيانات
         * 2. نبحث عن أدنى قاع حدث *قبل* تلك القمة
         */
        
        let highestHighIdx = 0;
        // البحث عن آخر قمة
        for (let i = 1; i < n; i++) {
            if (candles[i].high > candles[highestHighIdx].high) {
                highestHighIdx = i;
            }
        }

        // إذا كانت القمة هي أول شمعة، لا يمكننا إيجاد قاع قبلها
        if (highestHighIdx === 0) return null;

        let lowestLowIdx = 0;
        // البحث عن القاع الذي سبق هذه القمة
        for (let i = 1; i <= highestHighIdx; i++) {
            if (candles[i].low < candles[lowestLowIdx].low) {
                lowestLowIdx = i;
            }
        }

        // نقطة الشراء: تحت القاع بشوي (لاقتناص السيولة المضروبة)
        const targetLow = candles[lowestLowIdx].low;
        return targetLow - liquidityBuffer;

    } else if (trend === 'down') {
        /**
         * في الترند الهابط: نبحث عن "القمة التي كونت آخر قاع"
         * 1. نبحث عن أدنى قاع في البيانات
         * 2. نبحث عن أعلى قمة حدثت *قبل* ذلك القاع
         */

        let lowestLowIdx = 0;
        // البحث عن آخر قاع
        for (let i = 1; i < n; i++) {
            if (candles[i].low < candles[lowestLowIdx].low) {
                lowestLowIdx = i;
            }
        }

        // إذا كان القاع هو أول شمعة، لا يمكننا إيجاد قمة قبلها
        if (lowestLowIdx === 0) return null;

        let highestHighIdx = 0;
        // البحث عن القمة التي سبقت هذا القاع
        for (let i = 1; i <= lowestLowIdx; i++) {
            if (candles[i].high > candles[highestHighIdx].high) {
                highestHighIdx = i;
            }
        }

        // نقطة الدخول (البيع المكشوف أو الشراء العكسي): فوق القمة بشوي
        const targetHigh = candles[highestHighIdx].high;
        return targetHigh + liquidityBuffer;
    }

    return null;
}