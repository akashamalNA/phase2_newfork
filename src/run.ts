import dotenv from 'dotenv';
dotenv.config();

//console.log('GITHUB_TOKEN:', process.env.GITHUB_TOKEN);


import { getGithubContributors, getNpmContributors, cloneRepo, calculateRampUpMetric, checkLicenseCompatibility, calculateCorrectnessMetric, calculateResponsiveMaintainerMetric } from './metrics';
import logger, { flushLogs } from './logger';
import { test } from './test'; 
import * as performance from 'perf_hooks';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

async function processUrl(url: string): Promise<any> {
  const startTime = performance.performance.now();
  let results: any = { 
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
    License_Latency: '-1'
  };

  if (url.startsWith('https://github.com/')) {
    await processGithubUrl(url, results);
  } else if (url.startsWith('https://www.npmjs.com/package/')) {
    await processNpmUrl(url, results);
  } else {
    return null; // Return null if URL isn't valid
  }

  // Calculate NetScore and NetScore_Latency
  results.NetScore = calculateNetScore(results);
  results.NetScore_Latency = ((performance.performance.now() - startTime) / 1000).toFixed(3);

  return results;
}

async function processGithubUrl(url: string, results: any) {
  // Get the contributor count from GitHub API
  const busFactorStartTime = performance.performance.now();
  const contributorsCount = await getGithubContributors(url);
  results.BusFactor = contributorsCount >= 0 ? (contributorsCount).toFixed(2) : '-1';
  results.BusFactor_Latency = ((performance.performance.now() - busFactorStartTime)/ 1000).toFixed(3);

  // Clone the GitHub repository locally
  const repoName = url.replace('https://github.com/', '').replace('/', '_');
  const localPath = path.join(__dirname, '..', 'repos', repoName);

  // Ensure the repos directory exists
  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(path.join(__dirname, '..', 'repos'), { recursive: true });
  }

  // Clone the repository and calculate the Ramp Up metric
  await cloneRepo(url, localPath);
  const rampUpStartTime = performance.performance.now();
  const { ratio, sloc, comments } = await calculateRampUpMetric(localPath);
  results.RampUp = ratio.toFixed(2);
  results.RampUp_Latency = (((performance.performance.now() - rampUpStartTime) / 1000).toFixed(3));

  const CorrectnessStartTime = performance.performance.now();
  const test_ratio = await calculateCorrectnessMetric(localPath);
  results.Correctness = test_ratio.toFixed(2);
  results.Correctness_Latency = (((performance.performance.now() - CorrectnessStartTime) / 1000).toFixed(3));
  
  // Calculate Responsive Maintainer metric
  const responsiveMaintainerStartTime = performance.performance.now();
  const responsiveMaintainerScore = await calculateResponsiveMaintainerMetric(url);
  results.ResponsiveMaintainer = responsiveMaintainerScore.toFixed(2);
  results.ResponsiveMaintainer_Latency = ((performance.performance.now() - responsiveMaintainerStartTime) / 1000).toFixed(3);  

  // Check license compatibility
  const licenseStartTime = performance.performance.now();
  const licenseResult = await checkLicenseCompatibility(url);
  results.License = licenseResult.score.toFixed(2);
  results.License_Latency = ((performance.performance.now() - licenseStartTime) / 1000).toFixed(3);

}

async function processNpmUrl(url: string, results: any) {
  const startTime = performance.performance.now(); // Start time for npm processing
  const packageName = url.replace('https://www.npmjs.com/package/', '');

  try {
    // Fetch package data from the npm registry
    const npmStartTime = performance.performance.now();
    const npmResponse = await axios.get(`https://registry.npmjs.org/${packageName}`);
    const repository = npmResponse.data.repository;
    results.BusFactor_Latency = ((performance.performance.now() - npmStartTime) / 1000).toFixed(3);

    // Get contributors count
    const contributorsStartTime = performance.performance.now();
    const contributorsCount = await getNpmContributors(packageName);
    results.BusFactor = contributorsCount >= 0 ? (contributorsCount).toFixed(2) : '-1';
    results.BusFactor_Latency = ((performance.performance.now() - contributorsStartTime) / 1000).toFixed(3);

    if (repository && repository.url) {
      let githubUrl = repository.url;

      // Clean up the URL if it starts with 'git+', '.git', or 'ssh://git@github.com'
      githubUrl = githubUrl.replace('git+', '').replace('.git', '');
      githubUrl = githubUrl.replace('ssh://git@github.com', 'https://github.com');

      // Ensure the URL is a valid HTTPS URL
      if (!githubUrl.startsWith('https://')) {
        githubUrl = `https://${githubUrl}`;
      }

      // Continue with the rest of your code: cloning repo, calculating metrics, etc.
      const repoName = githubUrl.replace('https://github.com/', '').replace('/', '_');
      const localPath = path.join(__dirname, '..', 'repos', repoName);

      // Ensure the repos directory exists
      if (!fs.existsSync(localPath)) {
        fs.mkdirSync(path.join(__dirname, '..', 'repos'), { recursive: true });
      }

      const cloneStartTime = performance.performance.now();
      await cloneRepo(githubUrl, localPath);
      results.RampUp_Latency = ((performance.performance.now() - cloneStartTime) / 1000).toFixed(3);

      const rampUpStartTime = performance.performance.now();
      const { ratio, sloc, comments } = await calculateRampUpMetric(localPath);
      results.RampUp = ratio.toFixed(2);
      results.RampUp_Latency = ((performance.performance.now() - rampUpStartTime) / 1000).toFixed(3);

      const CorrectnessStartTime = performance.performance.now();
      const test_ratio = await calculateCorrectnessMetric(localPath);
      results.Correctness = test_ratio.toFixed(2);
      results.Correctness_Latency = ((performance.performance.now() - CorrectnessStartTime) / 1000).toFixed(3);

      const licenseStartTime = performance.performance.now();
      const licenseResult = await checkLicenseCompatibility(githubUrl);
      results.License = licenseResult.score.toFixed(2);
      results.License_Latency = ((performance.performance.now() - licenseStartTime) / 1000).toFixed(3);

      const responsiveMaintainerStartTime = performance.performance.now();
      const responsiveMaintainerScore = await calculateResponsiveMaintainerMetric(githubUrl);
      results.ResponsiveMaintainer = responsiveMaintainerScore.toFixed(2);
      results.ResponsiveMaintainer_Latency = ((performance.performance.now() - responsiveMaintainerStartTime) / 1000).toFixed(3);

    } else {
      // Handle missing repository field
      console.error(`No repository field found for npm package ${packageName}`);
    }
  } catch (error) {
    console.error(`Error processing npm package ${packageName}:`, error);
  }

  results.NetScore_Latency = ((performance.performance.now() - startTime) / 1000).toFixed(3);
}



async function processAllUrls(urls: string[]) {
  const resultsArray: any[] = [];

  for (const url of urls) {
    const result = await processUrl(url.trim());
    if (result) {
      resultsArray.push(result);
    }
  }

  // Calculate max values for Bus Factor and Ramp Up
  const validBusFactors = resultsArray.map(r => parseFloat(r.BusFactor)).filter(n => !isNaN(n) && n !== -1);
  const validRampUp = resultsArray.map(r => parseFloat(r.RampUp)).filter(n => !isNaN(n) && n !== -1);
  const maxBusFactor = validBusFactors.length > 0 ? Math.max(...validBusFactors) : 1; // Ensure max is > 0
  const maxRampUp = validRampUp.length > 0 ? Math.max(...validRampUp) : 1;

  // Adjust scores for Bus Factor and Ramp Up
  resultsArray.forEach(result => {
    const busFactor = parseFloat(result.BusFactor);
    const rampUp = parseFloat(result.RampUp);

    if (!isNaN(busFactor) && busFactor !== -1 && maxBusFactor > 0) {
      result.BusFactor = (busFactor / maxBusFactor).toFixed(2);
    } else {
      result.BusFactor = '0.00'; // Default to 0 if not available
    }

    if (!isNaN(rampUp) && rampUp !== -1 && maxRampUp > 0) {
      result.RampUp = (rampUp / maxRampUp).toFixed(2);
    } else {
      result.RampUp = '0.00'; // Default to 0 if not available
    }

    result.NetScore = calculateNetScore(result);
    
  });

  // Sort results by NetScore from highest to lowest
  resultsArray.sort((a, b) => parseFloat(b.NetScore) - parseFloat(a.NetScore));

  // Output sorted results
  resultsArray.forEach(result => console.log(JSON.stringify(result)));
}

// calculate NetScore function
function calculateNetScore(result: any): string {
  if (
    parseFloat(result.License) === 0 || 
    result.License === '0.00' || 
    result.BusFactor === '0.00' || 
    result.RampUp === '0.00' || 
    result.Correctness === '0.00' || 
    result.ResponsiveMaintainer === '0.00'
  ) {
    return '0.00';
  } else {
    const netScore = (
      parseFloat(result.BusFactor) * 0.2 +
      parseFloat(result.RampUp) * 0.1 +
      parseFloat(result.Correctness) * 0.1 +
      parseFloat(result.ResponsiveMaintainer) * 0.1 +
      parseFloat(result.License) * 0.5
    );
    return isNaN(netScore) ? '0.00' : netScore.toFixed(2);
  }
}

async function main() {
  require('dotenv').config(); //Neccesary for GITHUB_TOKEN
  const command = process.argv[2];

  if (command === 'install') {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    const dependencies = packageJson.dependencies ? Object.keys(packageJson.dependencies) : [];
    console.log(`${dependencies.length} dependencies installed...`);
    process.exit(0);
  } else if (command && command.endsWith('.txt')) {
    const fileContent = fs.readFileSync(command, 'utf-8');
    const urls = fileContent.split('\n').filter(url => url.trim() !== '');
    await processAllUrls(urls);
  } else if (command === 'test') { // "./run test" command is right here
    console.log('Test running...');
    //call test() 
    await test(); //test will output all error messages on it's own, don't need to handle here.
    console.log('Test completed.');
    await flushLogs(); //makes sure logger finished writing
  } else {
    console.error('Usage: ./run install | ./run <FILE_PATH>');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('An error occurred:', error);
  process.exit(1);
});
