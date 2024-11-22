"use strict";
/*
filename: run.ts

Description:
  This file is to take in `./run <file_name>.txt | test` and provide correct output according to the SPEC.

  1.) If it recieves `<file_name>.txt`, it will parse each URL within the file and return the calculated metric scores for each URL.
  2.) If it recieves `test`, it will run the test suite.
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processUrl = processUrl;
exports.processAllUrls = processAllUrls;
const metrics_1 = require("./metrics");
const logger_1 = __importStar(require("./logger"));
const performance = __importStar(require("perf_hooks"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const child_process_1 = require("child_process");
const express_1 = __importDefault(require("express"));
const packageRoutes_1 = __importDefault(require("./routes/packageRoutes"));
// charlie's additions:
const packageManager_1 = __importDefault(require("./packageManager"));
const cleanup_1 = __importDefault(require("./tests/cleanup"));
const resetState_1 = require("./resetState");
/* processUrl:
  1.) determines which URL is passed (GitHub or NPM) and calls the proper metric calculation function.
  2.) calculates the netScore and handles all rounding for each score.
  3.) returns the results.
*/
async function processUrl(url) {
    const netScoreStartTime = performance.performance.now();
    // init metric scores. 
    let results = {
        URL: url,
        NetScore: '-1',
        NetScore_Latency: '-1',
        RampUp: '-1',
        RampUp_Latency: '-1',
        Correctness: '-1',
        Correctness_Latency: '-1',
        BusFactor: '-1',
        BusFactor_Latency: '-1',
        ResponsiveMaintainer: '-1',
        ResponsiveMaintainer_Latency: '-1',
        License: '-1',
        License_Latency: '-1',
        GoodPinningPractice: "-1",
        GoodPinningPracticeLatency: "-1",
        PullRequest: "-1",
        PullRequestLatency: "-1"
    };
    // determine which type of URL is passed in (NPM, GitHub, or neither.)
    logger_1.default.info("Processing URL: " + url);
    if (url.startsWith('https://github.com/')) {
        await processGithubUrl(url, results);
    }
    else if (url.startsWith('https://www.npmjs.com/package/')) {
        await processNpmUrl(url, results);
    }
    else {
        logger_1.default.debug("Invalid URL path provided: " + url);
        return null;
    }
    results.NetScore_Latency = ((performance.performance.now() - netScoreStartTime) / 1000).toFixed(3);
    // Calculate NetScore (Use -1 where metrics are not yet implemented)
    logger_1.default.info("Calculating NetScore for URL: " + url);
    // if any of the metrics couldn't be calculated - automatically make netScore 0. 
    if (parseFloat(results.License) === 0 ||
        results.License === '-1' ||
        results.BusFactor === '-1' ||
        results.RampUp === '-1' ||
        results.Correctness === '-1' ||
        results.ResponsiveMaintainer === '-1' ||
        results.GoodPinningPractice === '-1' ||
        results.PullRequest === '-1') {
        results.NetScore = '0.00';
        // otherwise, calculate netscore. 
    }
    else {
        const netScore = (parseFloat(results.BusFactor) * 0.2 +
            parseFloat(results.RampUp) * 0.1 +
            parseFloat(results.Correctness) * 0.1 +
            parseFloat(results.ResponsiveMaintainer) * 0.1 +
            parseFloat(results.License) * 0.3 +
            parseFloat(results.GoodPinningPractice) * .1 +
            parseFloat(results.PullRequest) * .1);
        results.NetScore = netScore.toFixed(2);
    }
    // Convert all number values to floats
    for (let key in results) {
        if (key !== 'URL') {
            if (key.endsWith('_Latency')) {
                results[key] = parseFloat(Number(results[key]).toFixed(3));
            }
            else {
                results[key] = parseFloat(Number(results[key]).toFixed(2));
            }
        }
    }
    return results;
}
async function processGithubUrl(url, results) {
    // check for invalid token. 
    try {
        const token = process.env.GITHUB_TOKEN;
        if (!token || token === 'INVALIDTOKEN') {
            console.error("Error: Invalid GitHub token provided.");
            process.exit(1); // Exit with rc 1 for invalid token
        }
        // continue normally
    }
    catch (error) {
        console.error("Error while processing GitHub URL:", error);
        process.exit(1); // Exit on any errors
    }
    // Clone the GitHub repository locally
    const repoName = url.replace('https://github.com/', '').replace('/', '_');
    const localPath = path.join(__dirname, '..', 'repos', repoName);
    // assert repo directory exists. 
    if (!fs.existsSync(localPath)) {
        fs.mkdirSync(path.join(__dirname, '..', 'repos'), { recursive: true });
    }
    try {
        await (0, metrics_1.cloneRepo)(url, localPath);
    }
    catch (error) {
        logger_1.default.debug("Failed to clone GitHub repository: " + repoName);
    }
    // Start measuring latencies
    const startTimes = {
        busFactor: performance.performance.now(),
        rampUp: performance.performance.now(),
        correctness: performance.performance.now(),
        responsiveMaintainer: performance.performance.now(),
        license: performance.performance.now(),
        goodPinningPractice: performance.performance.now(),
        pullRequest: performance.performance.now()
    };
    // Run all metrics in parallel
    const [contributorsCount, rampUpScore, test_ratio, responsiveMaintainerScore, licenseResult, goodPinningPractice, pullRequest] = await Promise.all([
        (0, metrics_1.getBusFactor)(url).then(count => {
            results.BusFactor = count >= 0 ? parseFloat(count.toFixed(2)) : -1;
            results.BusFactor_Latency = parseFloat(((performance.performance.now() - startTimes.busFactor) / 1000).toFixed(3));
        }),
        (0, metrics_1.calculateRampUpMetric)(localPath).then(score => {
            results.RampUp = parseFloat(score.toFixed(2));
            results.RampUp_Latency = parseFloat(((performance.performance.now() - startTimes.rampUp) / 1000).toFixed(3));
        }),
        (0, metrics_1.calculateCorrectnessMetric)(localPath).then(test_ratio => {
            results.Correctness = parseFloat(test_ratio.toFixed(2));
            results.Correctness_Latency = parseFloat(((performance.performance.now() - startTimes.correctness) / 1000).toFixed(3));
        }),
        (0, metrics_1.calculateResponsiveMaintainerMetric)(url).then(score => {
            results.ResponsiveMaintainer = parseFloat(score.toFixed(2));
            results.ResponsiveMaintainer_Latency = parseFloat(((performance.performance.now() - startTimes.responsiveMaintainer) / 1000).toFixed(3));
        }),
        (0, metrics_1.checkLicenseCompatibility)(url).then(licenseResult => {
            results.License = parseFloat(licenseResult.score.toFixed(2));
            results.License_Latency = parseFloat(((performance.performance.now() - startTimes.license) / 1000).toFixed(3));
        }),
        (0, metrics_1.calculatePinnedDependenciesMetric)(url).then(goodPinningPractice => {
            results.goodPinningPractice = parseFloat(goodPinningPractice.toFixed(2));
            results.GoodPinningPracticeLatency = parseFloat(((performance.performance.now() - startTimes.goodPinningPractice) / 1000).toFixed(3));
        }),
        (0, metrics_1.calculateCodeFromPRsMetric)(url).then(pullRequest => {
            results.pullRequest = parseFloat(pullRequest.toFixed(2));
            results.PullRequestLatency = parseFloat(((performance.performance.now() - startTimes.pullRequest) / 1000).toFixed(3));
        }),
    ]);
    // We don't need to return anything since we modify the original `results` variable directly. 
}
async function processNpmUrl(url, results) {
    const packageName = url.replace('https://www.npmjs.com/package/', '');
    try {
        // Fetch package data from the npm registry
        const npmResponse = await axios_1.default.get(`https://registry.npmjs.org/${packageName}`);
        const repository = npmResponse.data.repository;
        // Get other metric information
        if (repository && repository.url) {
            let githubUrl = repository.url;
            // Clean up the URL if it starts with 'git+', '.git', or 'ssh://git@github.com'
            githubUrl = githubUrl.replace('git+', '').replace('.git', '').replace('git://', '');
            githubUrl = githubUrl.replace('ssh://git@github.com', 'https://github.com');
            // Ensure the URL is a valid HTTPS URL
            if (!githubUrl.startsWith('https://')) {
                githubUrl = `https://${githubUrl}`;
            }
            logger_1.default.info("Found GitHub URL for npm package: " + packageName);
            // Now call function with guthub corrected URL
            await processGithubUrl(githubUrl, results);
        }
        else {
            // Handle missing repository field
            logger_1.default.debug(`No repository field found for npm package ${packageName}`);
        }
    }
    catch (error) {
        logger_1.default.debug(`Error processing npm package ${packageName}: ${error}`);
    }
}
// this is the function that is called in main in order to process all of the URLs. 
async function processAllUrls(urls) {
    const resultsArray = [];
    for (const url of urls) {
        const result = await processUrl(url.trim());
        if (result) {
            resultsArray.push(result);
        }
    }
    // Sort results by NetScore from highest to lowest
    resultsArray.sort((a, b) => parseFloat(b.NetScore) - parseFloat(a.NetScore));
    // Output sorted results
    resultsArray.forEach(result => console.log(JSON.stringify(result)));
}
// Set up express server
function startServer() {
    const app = (0, express_1.default)();
    const port = 3000; // change later. 
    app.use(express_1.default.json());
    app.get('/health', (req, res) => {
        res.status(200).send('Server is running!');
    });
    // Add your API routes here
    app.use('/', packageRoutes_1.default);
    app.use('/cleanup', cleanup_1.default); //for cleaning
    app.use('/reset', resetState_1.resetState);
    // Add packageManager routes for upload/update and downloading
    app.use('/', packageManager_1.default); // Mount the packageManager routes
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
        logger_1.default.info(`Server started on port ${port}`);
    });
}
async function main() {
    const command = process.argv[2];
    // always spin up server. 
    startServer(); // Start server immediately
    // ./run <url_file>.txt
    if (command && command.endsWith('.txt')) {
        logger_1.default.info('Running URL processing from file: ' + command); // Log file processing info
        if (!fs.existsSync(command)) {
            logger_1.default.debug("Invalid file path provided: " + command); // Log invalid path
            console.error("Error: File does not exist.");
            process.exit(1); // Exit with 1 on failure
        }
        const fileContent = fs.readFileSync(command, 'utf-8');
        const urls = fileContent.split('\n').filter(url => url.trim() !== '');
        try {
            await processAllUrls(urls);
            process.exit(0); // Exit with 0 on successful URL processing
        }
        catch (error) {
            console.error("Error processing URLs:", error);
            process.exit(1); // Exit with 1 if any errors occur during URL processing
        }
        // ./run test
    }
    else if (command === 'test') {
        (0, child_process_1.exec)('npx nyc mocha -r ts-node/register src/**/*.ts', (error, stdout, stderr) => {
            if (error) {
                console.error(`Test failed: ${stderr}`);
                process.exit(1); // Exit with error
            }
            else {
                // Regex to capture the total test cases and passed test cases
                const testCasesRegex = /(\d+)\/(\d+) test cases passed\./;
                const testCasesMatch = stdout.match(testCasesRegex);
                // Regex to capture the line coverage percentage for all files
                const coverageRegex = /All files\s+\|\s+(\d+\.\d+)\s+\|\s+(\d+\.\d+)\s+\|\s+(\d+\.\d+)\s+\|\s+(\d+\.\d+)\s+/;
                const coverageMatch = stdout.match(coverageRegex);
                let passed = 0;
                let total = 0;
                let coverage = -1; // Default value for coverage if not found
                if (testCasesMatch) {
                    passed = parseInt(testCasesMatch[1], 10);
                    total = parseInt(testCasesMatch[2], 10);
                }
                else {
                    console.log('Test case information not found in output.');
                }
                if (coverageMatch) {
                    coverage = parseInt(coverageMatch[1], 10); // Capture the percentage
                }
                else {
                    console.log('Coverage percentage not found in output.');
                }
                console.log(`${passed}/${total} test cases passed. ${coverage}% line coverage achieved.`);
                process.exit(0); // Exit successfully
            }
        });
        await (0, logger_1.flushLogs)(); // Make sure logger finished writing. 
    }
}
main().catch(error => {
    logger_1.default.debug('An error occurred:', error);
    process.exit(1);
});