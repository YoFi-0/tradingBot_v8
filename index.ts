import { getLast1000andles } from "./historical";
import { getOrderPrice, getTrend } from "./math";

const main = async () => {
    const symbol = 'PTB-USDT';
    const interval = '1m';
    const candles = await getLast1000andles(symbol, interval);
    console.log(symbol, interval, getTrend(candles), getOrderPrice(candles));
}
main();