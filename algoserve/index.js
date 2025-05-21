import * as puppeteer from "puppeteer"
import * as fs from "node:fs/promises"

/**
 * @param {puppeteer.Browser} browser
 * @returns {Promise<puppeteer.Page>}
 */
export async function findLeetcodePage(browser) {
    console.log("getting pages")
    const pages = await browser.pages()
    console.log("got pages", pages.length)
    for (const page of pages) {
        console.log("page..", page.url())
        if (page.url().includes("https://leetcode.com/problems")) {
            return page
        }
    }

    throw new Error("couldn't find page")
}
/**
 * @param {puppeteer.Page} page 
 * @returns {Promise<boolean>} - Success status
 */

export async function extractQuestion(page) {
    try {
        const url = page.url();
        console.log("Extracting question from:", url);

        // Extract the problem details using page.evaluate
        const questionData = await page.evaluate(() => {
            // Get problem title
            const titleElement = document.querySelector('[data-cy="question-title"]');
            const title = titleElement ? titleElement.textContent.trim() : "Unknown Problem";

            // Get problem difficulty
            const difficultyElement = document.querySelector('[data-cy="question-difficulty"]');
            const difficulty = difficultyElement ? difficultyElement.textContent.trim() : "Unknown Difficulty";

            // Get problem description
            const descriptionElement = document.querySelector('[data-cy="question-content"]');
            const descriptionText = descriptionElement ?
                descriptionElement.innerText.replace(/\n{3,}/g, '\n\n') : "No description available";

            return {
                title,
                difficulty,
                descriptionText
            };
        });

        // Format content for markdown file
        const markdownContent = `# ${questionData.title}
## Difficulty: ${questionData.difficulty}
## URL: ${url}

${questionData.descriptionText}
`;

        // Save to tempq.md
        await fs.writeFile('qInfo.md', markdownContent, 'utf8');
        console.log("Successfully saved problem details to qInfo.md");

        return true;
    } catch (error) {
        console.error("Error extracting question:", error);
        return false;
    }
}


/**
 * @typedef {{
    state: "PENDING"
} | {
    status_code: number,
    run_success: boolean,
    finished: boolean,
    total_correct: 0,
    total_testcases: 104,
    status_msg: string,
    state: "SUCCESS"
    }} SubmitResponse
*/


/**
 * @param {puppeteer.Page} page
 * @param {string} id
 * @returns {Promise<SubmitResponse>}
 */
async function submission(page, id) {
    return new Promise((res, rej) => {
        async function innerSubmission(response) {
            if (response.url().includes(id)) {
                try {
                    const data = /** @type {SubmitResponse} */(await response.json())
                    if (data.state === "PENDING" || data.state === "STARTED") {
                        return
                    }
                    res(data)
                    page.off("response", innerSubmission)
                } catch (e) {
                    console.log("unable to get json", e, await response.text());
                    rej(e)
                }
            }
        }

        page.on('response', innerSubmission);
    });
}

/**
 * @param {puppeteer.Page} page
 * @returns {Promise<string>}
 */
async function listenForSubmit(page) {
    return new Promise((res, rej) => {
        /**
         * @param {puppeteer.HTTPResponse} response
         */
        async function innerListenForSubmit(response) {
            if (response.url().includes("submit")) {
                console.log("submit found!")
                page.off('response', innerListenForSubmit)
                try {
                    const data = await response.json()
                    res(data.submission_id)
                } catch (e) {
                    console.log("unable to get json", e, await response.text());
                    rej(e)
                }
            }
        }

        page.on('response', innerListenForSubmit)
    });
}

/**
 * @param {puppeteer.Browser} browser
 */
export async function listen(browser) {
    const page = await findLeetcodePage(browser)
    while (true) {
        try {
            const id = await listenForSubmit(page)
            const response = await submission(page, id);

            console.log(response.status_msg)
            if (response.status_msg === "Wrong Answer" || response.status_msg === "Runtime Error") {
                process.exit(1)
            }
            console.log(response)
            process.exit(0)
        } catch (e) {
        }
    }
}

/**
 * @param {puppeteer.Browser} browser
 */
export async function submit(browser) {
    const page = await findLeetcodePage(browser)
    console.log("page", page)
    const submitButton = await page.evaluateHandle(() => {
        const elements = Array.from(document.querySelectorAll('button'));
        return elements.find(el => el.textContent.trim().includes('Submit'));
    });

    const [
        _,
        id
    ] = await Promise.all([
        submitButton.click(),
        listenForSubmit(page),
    ]);

    const response = await submission(page, id);
    console.log(response.status_msg)
    if (response.status_msg === "Wrong Answer") {
        process.exit(1)
    }
    process.exit(0)
}

