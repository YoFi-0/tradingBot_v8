import { algo, backTestAlgo } from "./algo";
import { cancelOldOrders, order, orderCustom, setLavrage, testApiKeys } from "./bingx";
import { getLast1000andles } from "./old/historical";
import { openBrowser } from "./tradingView";
import express from "express";
import { sendDiscordMessage, sendTradeNotification } from "./webhook";

process.on('uncaughtException', (reason) => {
    console.error('Unhandled Rejection at:', 'reason:', reason);
    sendDiscordMessage(`Unhandled Exception Reason: ${reason}`);
});

const app = express();
app.get("/", (req, res) => {
    res.send("Hello World!");
});
app.listen(3000, () => {
    console.log("Server is running on port 3000");
});

interface IConfig {
    symbol: string;
    leverage: number;
    mode: "bingx_real" | "bingx_test" | "backtest";
    chartIntrval: "1m" | "15m" | "1h";
    sweepIntensity: number;
    usdtAmount: number;
}

export const config:IConfig = {
    symbol: 'SOL-USDT',
    leverage: 20,
    mode: "backtest",
    chartIntrval: "1m",
    sweepIntensity:2,
    usdtAmount: 50,
}

export const backTestConfig = {
    wallet: 100,             // رأس المال المبدئي
    leverage: 20,            // الرافعة المالية
    usdtPerTrade: 50,        // حجم الدخول بالهامش (الرصيد المستخدم في الصفقة)
    tradeTotalFees: 0.001,   // نسبة الرسوم (مثلاً 0.1% للفتح والإغلاق - تم تعديلها لتكون نسبة مئوية واقعية)
};

export const codeConfig = {
    urlTradingViewUserCode:"HlksI0LD"
}

const readeConfig = async () => {
    console.log("");
    await testApiKeys();
    console.log("symbol:", config.symbol);
    console.log("leverage:", config.leverage);
    console.log("mode:", config.mode);
    console.log("usdt amount per trade:", config.usdtAmount, "USDT");
    console.log("");
}

// const main = async () => {
//     await testApiKeys();
//     readeConfig();
//     const hasTrade = await hasActiveTrade();
//     if (hasTrade) {
//         console.log("close all open trades before start the bot");
//         return;
//     } else {
//         console.log("no active trades, you can start the bot ✅");
//     }
//     await setLavrage();
//     algo();
//     // const symbol = config.symbol;
//     // const interval = '1m';
//     // const candles = await getLast1000andles(symbol, interval);
//     // console.log(symbol, interval, getTrend(candles), getOrderPrice(candles));
// }

const main = async () => {
    await readeConfig();
    if(config.mode === "backtest") {
        backTestAlgo();
        return;
    }
    await cancelOldOrders();
    await sendDiscordMessage("Hi ThEre Its BeEN A While", "TraDing Bot : )")
    await setLavrage();
    await algo();
}
main();
