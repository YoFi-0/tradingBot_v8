import { config } from "."
import axios from "axios";
import  crypto from 'crypto';
import { sendDiscordMessage } from "./webhook";
const API_KEY = 'XKd5fFc3uyAUI4N3Yob3BV2JvRIZT0wdGWH5eUaEyEvJOZ6b1W6T5LD7dPOYO3FN83i4Zz6ctT9kSuxUIzJuGQ';
const API_SECRET = 'SjHgibUdwROozvfIxekcc65GjVKG2171RmJL2xq6bpbMn3C1Faa0upz40QlPw5qD0JYfVMXY3Q7o7w';

const sendHTTPRequest = async <T>(method: string, endpoint: string, params: any) => {
    const BASE_URL = config.mode == "bingx_test" ? 'https://open-api-vst.bingx.com' :
    config.mode == "bingx_real" ?  'https://open-api.bingx.com' : "https://open-api-vst.bingx.com";
    
    // 1. بناء النص الأصلي (للتوقيع) - بدون encodeURIComponent ⚠️
    const signString = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');

    // 2. التشفير وإنشاء التوقيع بناءً على النص الأصلي
    const signature = crypto
        .createHmac('sha256', API_SECRET)
        .update(signString)
        .digest('hex');

    // 3. بناء النص المشفّر (لإرساله في الرابط) - مع encodeURIComponent ✅
    const queryStringEncoded = Object.keys(params)
        .sort()
        .map(key => `${key}=${encodeURIComponent(params[key])}`)
        .join('&');

    // 4. دمج الرابط النهائي
    const url = `${BASE_URL}${endpoint}?${queryStringEncoded}&signature=${signature}`;

    try {
        const response = await axios({
            method: method,
            url: url,
            headers: { 'X-BX-APIKEY': API_KEY }
        });
        
        // التحقق من كود المنصة لضمان عدم وجود أخطاء منطقية
        if (response.data && response.data.code !== 0) {
            console.error('❌ The platform received the request and rejected it:', response.data);
            await sendDiscordMessage(`'❌ The platform received the request and rejected it:' ${JSON.stringify(response.data)}`, "BingX API Error");
        }
        
        return response.data as T;
    } catch (error: any) {
        if (error.response && error.response.data) {
            console.error('❌ bingx err:', error.response.data);
            await sendDiscordMessage(`❌ bingx err: ${JSON.stringify(error.response.data)}`, "BingX API Error");
        } else {
            console.error('❌ bingx connection err', error.message);
            await sendDiscordMessage(`❌ bingx connection err: ${JSON.stringify(error.response.data)}`, "BingX API Error");
        }
        throw error;
    }
}

/**
 * وظيفة لفحص الطلبات المفتوحة وإلغاء أي طلب مر عليه أكثر من 31 دقيقة
 */
export async function cancelOldOrders() {
    const symbol = config.symbol;
    const getOrdersEndpoint = '/openApi/swap/v2/trade/openOrders';
    const cancelOrderEndpoint = '/openApi/swap/v2/trade/order';
    
    const THIRTY_ONE_MINUTES_MS = 31 * 60 * 1000;


    const now = Date.now();
    
    // 1. جلب الطلبات المفتوحة حالياً
    const response: any = await sendHTTPRequest('GET', getOrdersEndpoint, { 
        symbol, 
        timestamp: now 
    });

    if (response.code === 0 && response.data && response.data.orders) {
        const openOrders = response.data.orders;

        for (const order of openOrders) {
            const orderTime = order.time; // وقت إنشاء الطلب من المنصة
            const ageMs = now - orderTime; // الفرق الزمني بالملي ثانية

            // 2. التحقق إذا كان الطلب أقدم من 31 دقيقة
            if (ageMs > THIRTY_ONE_MINUTES_MS) {
                const ageMinutes = Math.floor(ageMs / 60000);
                console.log(`⏳ canceling order ${order.orderId} which is ${ageMinutes} minutes old...`);

                // 3. تنفيذ طلب الإلغاء
                const cancelParams = {
                    symbol: symbol,
                    orderId: order.orderId,
                    timestamp: Date.now()
                };

                const cancelRes: any = await sendHTTPRequest('DELETE', cancelOrderEndpoint, cancelParams);
                
                if (cancelRes.code === 0) {
                    console.log(`✅ Order ${order.orderId} canceled successfully.`);
                    sendDiscordMessage(`❌ Order canceled after being open for ${ageMinutes} minutes.`, "TraDing Bot : )");
                } else {
                    console.error(`❌ Failed to cancel order ${order.orderId}: ${cancelRes.msg}`);
                    sendDiscordMessage(`❌ Failed to cancel order ${order.orderId}: ${cancelRes.msg}\n cancele it yourself`, "TraDing Bot : )");
                }
            }
        }
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
        console.log("mode:", config.mode);

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
            sendHTTPRequest('GET', '/openApi/swap/v2/user/positions', { timestamp }),
            sendHTTPRequest('GET', '/openApi/swap/v2/trade/openOrders', { symbol, timestamp })
        ]);

        const positions = (positionsResponse as any).data || [];
        const hasPosition = positions.length > 0;

        const openOrders = (ordersResponse as any).data || [];
        const hasOrder = openOrders.orders.length > 0;
        return hasPosition || hasOrder;

    } catch (error) {
        console.error(`❌ error at scanning active trades for ${symbol}:`, error);
        throw error; 
    }
}

export const setLavrage = async () => {
    const endpoint = '/openApi/swap/v2/trade/leverage';
    const params = {
        symbol: config.symbol,
        leverage: config.leverage,
        side: 'LONG',
        timestamp: Date.now()
    };
    await sendHTTPRequest('POST', endpoint, params);
    params.side = "SHORT"
     await sendHTTPRequest('POST', endpoint, params);
    console.log(`Leverage set to ${config.leverage}x for ${config.symbol}`);
}

export const order = async (entryPrice: number, positionSide: "LONG" | "SHORT") => {
    const endpoint = '/openApi/swap/v2/trade/order';
    const tpPercentage = 0.50; // 50% ربح
    const slPercentage = 0.25; // 25% خسارة

    let tpPrice: string;
    let slPrice: string;

    // 🚀 تصحيح الحسابات بناءً على نوع الصفقة
    if (positionSide === 'LONG') {
        tpPrice = (entryPrice * (1 + tpPercentage)).toFixed(2); // اللونق: الربح صعوداً
        slPrice = (entryPrice * (1 - slPercentage)).toFixed(2); // اللونق: الخسارة نزولاً
    } else { 
        // 🚀 الـ SHORT: نعكس الحسبة!
        tpPrice = (entryPrice * (1 - tpPercentage)).toFixed(2); // الشورت: الربح نزولاً
        slPrice = (entryPrice * (1 + slPercentage)).toFixed(2); // الشورت: الخسارة صعوداً
    }

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
            stopPrice: parseFloat(tpPrice),
        }),
        stopLoss: JSON.stringify({
            type: "STOP_MARKET",
            stopPrice: parseFloat(slPrice)
        }),
        timestamp: Date.now()
    };
    const res = await sendHTTPRequest('POST', endpoint, params);
    if ((res as any).code != 0) {
        console.error(`❌ Error placing order: ${(res as any).msg}`);
    }
    console.log(`Order placed: ${positionSide} at ${parseFloat(entryPrice.toFixed(5))}, TP: ${tpPrice}, SL: ${slPrice}`);
}

export const orderCustom = async (entryPrice: number, positionSide: "LONG" | "SHORT", tpPrice: number, slPrice: number) => {
    const endpoint = '/openApi/swap/v2/trade/order';

    const tpPriceStr = tpPrice.toFixed(2);
    const slPriceStr = slPrice.toFixed(2);

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
            stopPrice: parseFloat(tpPriceStr),
        }),
        stopLoss: JSON.stringify({
            type: "STOP_MARKET",
            stopPrice: parseFloat(slPriceStr)
        }),
        timestamp: Date.now()
    };
    const res = await sendHTTPRequest('POST', endpoint, params);
    if ((res as any).code != 0) {
        console.error(`❌ Error placing order: ${(res as any).msg}`);
    }
    console.log(`Order placed: ${positionSide} at ${parseFloat(entryPrice.toFixed(5))}, TP: ${tpPrice}, SL: ${slPrice}`);
}
