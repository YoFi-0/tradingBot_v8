import WebSocket from 'ws';
import axios from 'axios';
import { gunzipSync } from 'zlib';


export async function getLast1000andles(symbol: string, interval: string = '1h'): Promise<any[]> {
    const url = 'https://open-api.bingx.com/openApi/swap/v3/quote/klines';
    
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
            return response.data.data;
        } else {
            throw new Error(`API Error: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        console.error(`Failed to fetch candles for ${symbol}:`, error);
        throw error;
    }
}

