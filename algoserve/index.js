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
 * @param {puppeteer.Page} page -  LeetCode problem page
 * @returns {Promise<boolean>} - Success status
 */
export async function extractQuestion(page) {
    const url = page.url();

    let questionData = {
        title: "Unknown Problem",
        difficulty: "Unknown Difficulty",
        descriptionText: "No description available"
    };

    try {

        // Extract the problem details using page.evaluate with current selectors
        const extractedData = await page.evaluate(() => {

            let title = "Unknown Problem";
            let difficulty = "Unknown Difficulty";
            let descriptionText = "No description available";

            let titleFound = false;
            let difficultyFound = false;
            let descriptionFound = false;

            // --- Title Extraction ---
            let titleElement = document.querySelector('a.text-title-large, h3.text-title-large, div.text-title-large'); // Added h3 as a common heading tag
            if (titleElement) {
                title = titleElement.textContent.trim();
                titleFound = true;
                console.log("Found title with selector:", titleElement.tagName, title);
            } else {
                console.log("Title element not found with current selectors.");
            }

            // --- Difficulty Extraction ---
            const difficultyElement = document.querySelector('.text-difficulty-medium, .text-difficulty-easy, .text-difficulty-hard');
            if (difficultyElement && difficultyElement.textContent.trim()) {
                difficulty = difficultyElement.textContent.trim();
                difficultyFound = true;
                console.log("Found difficulty:", difficulty);
            } else {
                console.log("Difficulty selector failed.");
            }

            // --- Description Extraction ---
            const descriptionContainer = document.querySelector('div[data-track-load="description_content"]');

            if (descriptionContainer) {
                descriptionText = descriptionContainer.innerText
                    .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines to two
                    .trim();
                descriptionFound = true;
                console.log("Found description with data-track-load, length:", descriptionText.length);
            } else {
                console.log("Description container with data-track-load not found.");

                const fallbackDescription = document.querySelector('div.leet-code-problem-content div[class*="content"]'); // More generic, but might be too broad
                if (fallbackDescription) {
                    descriptionText = fallbackDescription.innerText
                        .replace(/\n{3,}/g, '\n\n')
                        .trim();
                    descriptionFound = true;
                    console.log("Found description with generic fallback, length:", descriptionText.length);
                } else {
                    console.log("All description selectors failed.");
                }
            }


            return {
                title,
                difficulty,
                descriptionText,
                titleFound,
                difficultyFound,
                descriptionFound
            };
        });

        // Update questionData with extracted data
        questionData = {
            title: extractedData.title,
            difficulty: extractedData.difficulty,
            descriptionText: extractedData.descriptionText
        };

        if (questionData.descriptionText.length < 50) {
            console.warn("WARNING: Description extracted is very short. It might be incomplete.");
        }


    } catch (error) {
        console.error("Error details:", error);
    }

    try {
        const markdownContent = `# ${questionData.title}
## Difficulty: ${questionData.difficulty}
## URL: ${url}
## Extraction Time: ${new Date().toISOString()}

${questionData.descriptionText}

---
## *Code Solution*
`;

        await fs.writeFile('tempq.md', markdownContent, 'utf8');

        // Verify file was created
        try {
            const stats = await fs.stat('tempq.md');
            console.log("File size:", stats.size, "bytes");
        } catch (statError) {
            console.error(" Could not verify file creation:", statError);
        }

        return true;
    } catch (writeError) {
        console.error("Write error:", writeError);

        // Try to create a minimal dummy file
        try {
            const dummyContent = `# LeetCode Problem
## URL: ${url}
## Status: Extraction Failed
## Time: ${new Date().toISOString()}

Could not extract problem details. Please check the selectors or page structure.

Error: ${writeError.message}
`;
            await fs.writeFile('tempq.md', dummyContent, 'utf8');
        } catch (dummyError) {
        }

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
            // FIX: Add 'Compile Error' to the conditions that trigger process.exit(1)
            if (response.status_msg === "Wrong Answer" || response.status_msg === "Runtime Error" || response.status_msg === "Compile Error") {
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


