import WebSocket from 'ws';
import axios from 'axios';
import { gunzipSync } from 'zlib';
import { config } from '..';
import { ICandle, IRawCandle } from './math';

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

export async function getLast1000andles(interval:"1m" | "15m" | "1h"): Promise<any[]> {
    const url = 'https://open-api.bingx.com/openApi/swap/v3/quote/klines';
    const symbol = config.symbol;
    try {
        const response = await axios.get(url, {
            params: {
                symbol: symbol,
                interval: interval,
                limit: 1000
            }
        });

        // BingX standard response format wraps data in a "code" and "data" object
        if (response.data && response.data.code === 0) {
            const candles = response.data.data;
            const formattedCandles = candles.map(formatCandleData);
            return formattedCandles;
        } else {
            throw new Error(`API Error: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        console.error(`Failed to fetch candles for ${symbol}:`, error);
        throw error;
    }
}

