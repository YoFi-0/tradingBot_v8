import axios from "axios";
import { config } from ".";

async function sendDiscordMessage(message: string, title?: string) {
    const webhookUrl = "https://discord.com/api/webhooks/1492549440458850485/2OO6cnd71GCbhT7Qui_ce2AvgM6oUlAaSx3EwchYJXXSg6HQHIneScQphWd0TSGq-gdY"
    try {
        const response = await axios.post(webhookUrl, {
            content: message,
            username: title || "tttrading bot",
        });
    } catch (error:any) {
        console.error('error when sending Discord message:', error.response ? error.response.data : error.message);
    }
}

export async function sendTradeNotification(tradeDetails: {
    type: "LONG" | "SHORT";
    entryPrice: number;
    takeProfit: number;
    stopLoss: number;
}) {
    const { type, entryPrice, takeProfit, stopLoss } = tradeDetails;
    const msg = `
    \`\`\`
new trade alert 🚀
Symbol: ${config.symbol}
Type: ${type}
Entry Price: ${entryPrice}
Take Profit: ${takeProfit}
Stop Loss: ${stopLoss}\`\`\`
`
    await sendDiscordMessage(msg, "TraDing Bot : )");
}