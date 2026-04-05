import { config } from ".";
import { hasActiveTrade, order } from "./bingx";
import { getLast1000andles } from "./historical";
import { getOrderPrice, getTrend } from "./math";

export const algo = async () => {
    const symbol = config.symbol;
    const interval = '1m';
    const run = async () => {
        const ishaveActiveTrade = await hasActiveTrade();
        if(ishaveActiveTrade) {
            console.log("there is active trade, skip this round");
            return;
        }
        const candles = await getLast1000andles(symbol, interval);
        const trend = getTrend(candles);
        const getBuyPrice = getOrderPrice(candles);
        if(!getBuyPrice) {
            console.log("cannot get buy price, skip this round");
            return;
        }
        order(getBuyPrice, trend === "up" ? "LONG" : "SHORT");
    }
    run();
    setInterval(async () => {
        run();
    }, 1000 * 60);

}