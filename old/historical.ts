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
export async function getHistoricalData(interval: "1m" | "15m" | "1h", startTimestamp: number, endTimestamp: number, fileName: string): Promise<any[]> {
    const filePath = path.join(process.cwd(), `backtest-data/${fileName}`);
    // 1. التحقق من وجود الملف
    try {
        const fileData = await fs.readFile(filePath, 'utf-8');
        console.log(`✅ Data loaded from file: ${fileName}`);
        return JSON.parse(fileData);
    } catch (error: any) {
        if (error.code !== 'ENOENT') throw error; 
    }

    console.log("🌐 Fetching data from API, this may take a while...");
    
    let currentEndTime = endTimestamp;
    let allCandles: any[] = [];

    while (currentEndTime > startTimestamp) {
        await delay(150); // تأخير لتجنب الحظر

        const batch = await getCandlesBatch(interval, currentEndTime);

        if (batch.length === 0) {
            console.log("⚠️ API returned no more historical data. Exchange limit reached.");
            break; 
        }

        const filteredBatch = batch.filter((c: any) => c.time >= startTimestamp);

        // إضافة الدفعة في بداية المصفوفة لأننا نتحرك من الحاضر للماضي
        allCandles = [...filteredBatch, ...allCandles];

        // بما أننا لم نعكس المصفوفة، العنصر الأول [0] هو الأقدم فعلياً
        const oldestCandleTime = batch[0].time;

        if (oldestCandleTime <= startTimestamp) {
            break;
        }

        // نحدث وقت النهاية للدفعة القادمة
        currentEndTime = oldestCandleTime - 1;
        
        console.log(`Fetched ${filteredBatch.length} candles. Oldest time in batch: ${new Date(oldestCandleTime).toISOString()} - Total: ${allCandles.length}`);
        console.log("💾 Data collection complete, saving to file...");
        await fs.writeFile(filePath, JSON.stringify(allCandles, null, 2));
    }

    

    return allCandles;
}
