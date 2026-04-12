import WebSocket from 'ws';
import axios from 'axios';
import { gunzipSync } from 'zlib';
import { config } from '..';
import { ICandle, IRawCandle } from './math';
import fs from 'fs/promises';
import path from 'path';

function formatCandleData(rawCandle: IRawCandle): ICandle {
  return {
    open: Number(rawCandle.open),
    close: Number(rawCandle.close),
    high: Number(rawCandle.high),
    low: Number(rawCandle.low),
    volume: Number(rawCandle.volume),
    time: rawCandle.time
  };
}
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getLast1000andles(interval:"1m" | "15m" | "1h"): Promise<any[]> {
    const url = 'https://open-api.bingx.com/openApi/swap/v3/quote/klines';
    const symbol = config.symbol;
    try {
        const response = await axios.get(url, {
            params: {
                symbol: symbol,
                interval: interval,
                limit: 1000,
                endTime: Date.now()
            }
        });

        // BingX standard response format wraps data in a "code" and "data" object
        if (response.data && response.data.code === 0) {
            const candles = response.data.data;
            const formattedCandles = candles.map(formatCandleData).reverse();
            return formattedCandles;
        } else {
            throw new Error(`API Error: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        console.error(`Failed to fetch candles for ${symbol}:`, error);
        throw error;
    }
}

async function getCandlesBatch(interval: "1m" | "15m" | "1h", endTime: number): Promise<any[]> {
    const url = 'https://open-api.bingx.com/openApi/swap/v3/quote/klines';
    const symbol = config.symbol;
    
    try {
        const response = await axios.get(url, {
            params: {
                symbol: symbol,
                interval: interval,
                limit: 1000,
                endTime: endTime
            }
        });
        console.log(`API Response for batch ending at ${new Date(endTime).toISOString()}:`, response.data);
        if (response.data && response.data.code === 0) {
            const candles = response.data.data;
            // ❌ أزلنا .reverse() لنحافظ على الترتيب الأصلي: (الأقدم -> الأحدث)
            return candles.map(formatCandleData);
        } else {
            throw new Error(`API Error: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        console.error(`Failed to fetch candles for ${symbol}:`, error);
        throw error;
    }
}

// قمنا بتعديل الدالة لتجلب بيانات فترة معينة بدلاً من سنة كاملة فقط
export async function getHistoricalData(
    interval: "1m" | "15m" | "1h", 
    startTimestamp: number, 
    endTimestamp: number, 
    fileName: string
): Promise<any[]> {
    
    // 🛡️ حماية مبدئية: التأكد أن التواريخ منطقية
    if (startTimestamp >= endTimestamp) {
        console.error("❌ Error: startTimestamp is greater than or equal to endTimestamp!");
        return [];
    }

    const filePath = path.join(process.cwd(), `backtest-data/${fileName}`);

    // 1. التحقق من وجود بيانات محلية
    try {
        const fileData = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(fileData);
        if (parsedData.length > 0) {
            console.log(`✅ Loaded ${parsedData.length} candles from local file: ${fileName}`);
            return parsedData;
        }
    } catch (e: any) {
        if (e.code !== 'ENOENT') throw e; 
    }

    console.log(`🌐 Fetching API Data from ${new Date(startTimestamp).toLocaleString()} to ${new Date(endTimestamp).toLocaleString()}...`);

    let currentEnd = endTimestamp;
    let allCandles: any[] = [];
    let lastFetchedTime = 0; // عشان نكشف الدوامات الزمنية

    while (currentEnd > startTimestamp) {
        await delay(200); // تأخير آمن لتجنب حظر الـ IP

        // 🟢 استدعاء الـ API (استخدم الدالة الخاصة بك هنا)
        const batch = await getCandlesBatch(interval, currentEnd);

        if (!batch || batch.length === 0) {
            console.log("⚠️ API returned empty data. Stopping.");
            break;
        }

        // بما أن المصفوفة تأتي مرتبة، أقدم شمعة هي أول عنصر
        const oldestCandleInBatch = batch[0];
        
        // 🛡️ حماية من الدوامة الزمنية (إذا المنصة علقت على نفس الدفعة)
        if (oldestCandleInBatch.time === lastFetchedTime) {
            console.log("⚠️ Reached Genesis Block or API is looping. Stopping.");
            break;
        }
        lastFetchedTime = oldestCandleInBatch.time;

        // فلترة الشموع لضمان عدم أخذ بيانات أقدم من المطلوبة أو أحدث من المطلوبة
        const validCandles = batch.filter((candle: any) => 
            candle.time >= startTimestamp && candle.time <= endTimestamp
        );

        // دمج الشموع الجديدة في بداية المصفوفة (لأننا نرجع للخلف)
        allCandles = [...validCandles, ...allCandles];

        console.log(`📥 Fetched ${validCandles.length} valid candles. Oldest time: ${new Date(oldestCandleInBatch.time).toISOString()} | Total: ${allCandles.length}`);

        // إذا كانت أقدم شمعة سحبناها أقدم من أو تساوي وقت البداية المطلوب، كذا خلصنا
        if (oldestCandleInBatch.time <= startTimestamp) {
            console.log("🎯 Successfully reached the target start date.");
            break;
        }

        // تحديث وقت النهاية للدفعة القادمة ليكون قبل أقدم شمعة بـ 1 ملي ثانية
        currentEnd = oldestCandleInBatch.time - 1;
    }

    // 2. معالجة وتخزين البيانات النهائية
    if (allCandles.length > 0) {
        // خطوة إضافية لضمان عدم وجود شموع مكررة (تنظيف البيانات)
        const uniqueCandles = Array.from(new Map(allCandles.map(c => [c.time, c])).values());
        
        // ترتيب تصاعدي (من الماضي للحاضر) تحسباً لأي لخبطة في الـ API
        uniqueCandles.sort((a, b) => a.time - b.time);

        console.log(`💾 Saving ${uniqueCandles.length} final unique candles to disk...`);
        await fs.writeFile(filePath, JSON.stringify(uniqueCandles, null, 2));
        console.log("✅ Process completed successfully!");
        
        return uniqueCandles;
    } else {
        console.log("❌ No candles were fetched within this time range. Double check the exchange API capabilities.");
        return [];
    }
}
