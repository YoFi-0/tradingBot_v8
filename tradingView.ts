import puppeteer from "puppeteer-extra";
import { Page } from "puppeteer";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { codeConfig, config } from "."
import fs from "fs";
import path from "path";

puppeteer.use(StealthPlugin());
let tv:Page | null = null;



export const openBrowser = async () => {
    const targetDir = path.join(__dirname, 'BotProfile');
    const url = getCoinTradingViewURL(config.symbol)
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 
        userDataDir: targetDir,
        ignoreDefaultArgs: ["--enable-automation"]
    });
    const page = await browser.newPage();
    await page.goto(url);
    await sleep(5000);
    tv = page;
}

const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));

export const GetFromDataView = (indicatorIndex:number) => {
    if(!tv) {
        throw new Error("TradingView page is not initialized");
    }
    return tv.evaluate((indicatorIndex) => {
        // @ts-ignore
        const pane = document.querySelectorAll(".item-_gbYDtbd")[indicatorIndex].querySelector("span");
        if(!pane) {
            throw new Error("Indicator pane not found");
        }
        return pane.textContent;
    }, indicatorIndex);
}

const getCoinTradingViewURL = (coin:string) => {
    const targetCoin = coin.split("-")[0]
    return `https://www.tradingview.com/chart/${codeConfig.urlTradingViewUserCode}/?symbol=BINANCE%3A${targetCoin}USDT.P`
}