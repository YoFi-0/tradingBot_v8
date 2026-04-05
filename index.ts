import { algo } from "./algo";
import { hasActiveTrade, setLavrage, testApiKeys } from "./bingx";
import { getLast1000andles } from "./historical";
import { getOrderPrice, getTrend } from "./math";

export const config = {
    symbol: 'MMT-USDT',
    leverage: 20,
    isTest: true,
    usdtAmount: 50,
}

const readeConfig = () => {
    console.log("");
    console.log("symbol:", config.symbol);
    console.log("leverage:", config.leverage);
    console.log("isTest:", config.isTest ? "ON 🧪" : "OFF 🔥");
    console.log("usdt amount per trade:", config.usdtAmount, "USDT");
    console.log("");
}

const main = async () => {
    await testApiKeys();
    readeConfig();
    const hasTrade = await hasActiveTrade();
    if (hasTrade) {
        console.log("close all open trades before start the bot");
        return;
    } else {
        console.log("no active trades, you can start the bot ✅");
    }
    await setLavrage();
    algo();
    // const symbol = config.symbol;
    // const interval = '1m';
    // const candles = await getLast1000andles(symbol, interval);
    // console.log(symbol, interval, getTrend(candles), getOrderPrice(candles));
}
main();