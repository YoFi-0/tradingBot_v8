import { config } from ".";
import { hasActiveTrade, order } from "./bingx";

export const algo = async () => {
    const symbol = config.symbol;
    const interval = '1m';
    const run = async () => {
        const ishaveActiveTrade = await hasActiveTrade();
        if(ishaveActiveTrade) {
            console.log("there is active trade, skip this round");
            return;
        }
        
        // algo here

        // order(getBuyPrice, trend === "up" ? "LONG" : "SHORT");
    }
    run();
    setInterval(async () => {
        run();
    }, 1000 * 60);

}