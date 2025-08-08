// indexer.js
// A standalone script to test folder indexing performance with a depth limit.
//
// To run this from your terminal:
// 1. Save this file as `indexer.js` in your project directory.
// 2. Replace the placeholder path in `folderToIndexPath` with the actual path you want to test.
// 3. Run the command: node indexer.js

const fs = require('fs').promises;
const path = require('path');

/**
 * Recursively finds subfolders up to a specified depth.
 * @param {string} currentPath The directory to start scanning from.
 * @param {string[]} subfolders An array to store the found folder paths.
 * @param {number} currentDepth The current recursion depth.
 * @param {number} maxDepth The maximum recursion depth.
 */
async function findSubfolders(currentPath, subfolders, currentDepth, maxDepth) {
    // Stop recursing if the current depth has reached the maximum limit.
    if (currentDepth >= maxDepth) {
        return;
    }

    try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                subfolders.push(fullPath);
                // This recursive call is what we are testing.
                await findSubfolders(fullPath, subfolders, currentDepth + 1, maxDepth);
            }
        }
    } catch (error) {
        // Ignore errors from folders we can't access (e.g., permissions)
        // console.error(`Could not read directory: ${currentPath}`);
    }
}
module.exports = { findSubfolders };

if (require.main === module) {
    // --- CONFIGURATION ---
    // !!! IMPORTANT: Replace this with the full path to the folder you want to index.
    const folderToIndexPath = '/Users/ricardo/Library/CloudStorage/GoogleDrive-ricardo.rplazas@gmail.com';
    const MAX_DEPTH = 5; // The maximum number of subfolder levels to scan.
    // !!!!!!!!!!!!!!!!!!!!!

    async function main() {
        if (folderToIndexPath === '/path/to/your/test/folder') {
            console.error("Please update the `folderToIndexPath` variable in this script with the folder you want to test.");
            return;
        }

        console.log(`Starting to index folder: ${folderToIndexPath} (up to ${MAX_DEPTH} levels deep)`);
        const startTime = process.hrtime();

        const subfolders = [];
        // Start the initial scan at depth 0.
        await findSubfolders(folderToIndexPath, subfolders, 0, MAX_DEPTH);

        const endTime = process.hrtime(startTime);
        const durationInMs = (endTime[0] * 1000 + endTime[1] / 1e6).toFixed(2);

        console.log(`\n--- Indexing Complete ---`);
        console.log(`Found ${subfolders.length} subfolders within ${MAX_DEPTH} levels.`);
        console.log(`Time taken: ${durationInMs} ms`);
        console.log('\nFound folders:');
        console.log(subfolders);
    }

    main();
}
