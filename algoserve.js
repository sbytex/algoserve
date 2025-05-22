import * as puppeteer from "puppeteer";
import * as algoserve from "./algoserve/index.js";

async function getBrowser() {
    return puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null,
    });
}

async function run() {
    const browser = await getBrowser();
    const op = process.argv[2];

    switch (op) {
        case "submit":
            console.log("Operation: Submit");
            await algoserve.submit(browser);
            break;
        case "listen":
            console.log("Operation: Listen");
            await algoserve.listen(browser);
            break;
        case "extract":
            console.log("Operation: Extract Question");
            const page = await algoserve.findLeetcodePage(browser);
            if (page) {
                await algoserve.extractQuestion(page);
            } else {
                console.error("Could not find a LeetCode problem page to extract from.");
                process.exit(1);
            }
            break;
        default:
            console.warn(`Unknown operation: "${op}". Supported operations are: submit, listen, extract`);
            process.exit(1);
    }

    process.exit(0); // Exit gracefully after the operation completes
}

run();
