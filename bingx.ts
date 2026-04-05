import { config } from "."
import axios from "axios";
import  crypto from 'crypto';
const API_KEY = 'XKd5fFc3uyAUI4N3Yob3BV2JvRIZT0wdGWH5eUaEyEvJOZ6b1W6T5LD7dPOYO3FN83i4Zz6ctT9kSuxUIzJuGQ';
const API_SECRET = 'SjHgibUdwROozvfIxekcc65GjVKG2171RmJL2xq6bpbMn3C1Faa0upz40QlPw5qD0JYfVMXY3Q7o7w';

const sendHTTPRequest = async <T>(method: string, endpoint: string, params: any) => {
    const BASE_URL = config.isTest ? 'https://open-api-vst.bingx.com' : 'https://open-api.bingx.com';
    
    // 1. ترتيب المعاملات وتشفير القيم (URL Encoding) للرموز والأقواس
    const queryString = Object.keys(params)
        .sort()
        .map(key => {
            // 💡 التعديل هنا: استخدام encodeURIComponent
            return `${key}=${encodeURIComponent(params[key])}`;
        })
        .join('&');

    // 2. التشفير وإنشاء التوقيع
    const signature = crypto
        .createHmac('sha256', API_SECRET)
        .update(queryString)
        .digest('hex');

    const url = `${BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    // 3. إرسال الطلب
    try {
        const response = await axios({
            method: method,
            url: url,
            headers: { 'X-BX-APIKEY': API_KEY }
        });
        return response.data as T;
    } catch (error: any) {
        // طباعة تفاصيل الخطأ من المنصة لتسهيل قراءته لك بدال اللستة الطويلة
        if (error.response && error.response.data) {
            console.error('❌ خطأ من المنصة:', error.response.data);
        } else {
            console.error('❌ خطأ في الاتصال:', error.message);
        }
        throw error;
    }
}

export async function testApiKeys() {
    const endpoint = '/openApi/swap/v2/user/balance';

    const params = {
        timestamp: Date.now()
    };
    try {

        const response:any = await sendHTTPRequest('GET', endpoint, params);
        console.log("🔑 API keys are valid ✅");
        console.log("test mode:", config.isTest ? "ON 🧪" : "OFF 🔥");

        console.log("api keys are valid ✅");
 
        const balanceData = response.data;
        console.log('balanceData:', balanceData.balance.balance, "USDT");
        return true;
    } catch (error:any) {
        console.error('❌ error at validate API keys:', error.response ? error.response.data : error.message);
        return false;
    }
}

export async function hasActiveTrade() {
    const symbol = config.symbol;
    try {
        const timestamp = Date.now();

        // 🚀 تنفيذ الطلبين في نفس الوقت لتسريع الاستجابة
        const [positionsResponse, ordersResponse] = await Promise.all([
            sendHTTPRequest('GET', '/openApi/swap/v2/user/positions', { symbol, timestamp }),
            sendHTTPRequest('GET', '/openApi/swap/v2/trade/openOrders', { symbol, timestamp })
        ]);

        const positions = (positionsResponse as any).data || [];
        const hasPosition = positions.some((pos:any) => parseFloat(pos.positionAmt) !== 0);

        const openOrders = (ordersResponse as any).data || [];
        const hasOrder = openOrders.length > 0;

        return hasPosition || hasOrder;

    } catch (error) {
        console.error(`❌ error at scanning active trades for ${symbol}:`, error);
        throw error; 
    }
}

export const setLavrage = async () => {
    const endpoint = '/openApi/swap/v2/position/leverage';
    const params = {
        symbol: config.symbol,
        leverage: config.leverage,
        side: 'BOTH',
        timestamp: Date.now()
    };
    await sendHTTPRequest('POST', endpoint, params);
    console.log(`Leverage set to ${config.leverage}x for ${config.symbol}`);
}

export const order = async (entryPrice: number, positionSide: "LONG" | "SHORT") => {
    const endpoint = '/openApi/swap/v2/trade/order';
    const tpPercentage = 0.50; // 50% ربح
    const slPercentage = 0.25; // 25% خسارة

    const tpPrice = (entryPrice * (1 + tpPercentage)).toFixed(2); // 63000.00
    const slPrice = (entryPrice * (1 - slPercentage)).toFixed(2); // 58200.00

    const rawQuantity = (config.usdtAmount * config.leverage) / entryPrice;
    const finalQuantity = parseFloat(rawQuantity.toFixed(3));

    const params = {
        symbol: config.symbol,
        side: positionSide === 'LONG' ? 'BUY' : 'SELL',
        positionSide: positionSide,
        type: 'LIMIT',
        quantity: finalQuantity,
        price: entryPrice,
        takeProfit: JSON.stringify({
            type: "TAKE_PROFIT_MARKET",
            stopPrice: parseFloat(tpPrice)
        }),
        stopLoss: JSON.stringify({
            type: "STOP_MARKET",
            stopPrice: parseFloat(slPrice)
        }),
        timestamp: Date.now()
    };
    await sendHTTPRequest('POST', endpoint, params);
    console.log(`Order placed: ${positionSide} at ${parseFloat(entryPrice.toFixed(5))}, TP: ${tpPrice}, SL: ${slPrice}`);
}