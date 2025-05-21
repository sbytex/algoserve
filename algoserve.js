import * as  puppeteer from "puppeteer";
import * as algoserve from "./algoserve/index.js"


async function getBrowser() {
    return puppeteer.connect({
        browserURL: 'http://localhost:9222', // Ensure this matches the remote debugging port
        defaultViewport: null,
    });
}


async function run() {
    const browser = await getBrowser()
    const op = process.argv[2];

    switch (op) {
        case "submit":
            await algoserve.submit(browser)
            break;
        case "listen":
            await algoserve.listen(browser)
            break;
    }

    process.exit(0)
}

run();
