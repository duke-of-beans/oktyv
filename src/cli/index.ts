#!/usr/bin/env node
/**
 * Oktyv CLI
 * 
 * Command-line interface for Oktyv browser automation platform.
 * Provides standalone access to all connectors without MCP.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { BrowserSessionManager } from '../browser/session.js';
import { RateLimiter } from '../browser/rate-limiter.js';
import { LinkedInConnector } from '../connectors/linkedin.js';
import { IndeedConnector } from '../connectors/indeed.js';
import { WellfoundConnector } from '../connectors/wellfound.js';
import { GenericBrowserConnector } from '../connectors/generic.js';
import { formatJobResults, formatJob, formatCompany, formatGenericResult } from './formatters.js';
import type { JobSearchParams } from '../types/job.js';

const program = new Command();

// Initialize browser infrastructure (shared across all commands)
const sessionManager = new BrowserSessionManager();
const rateLimiter = new RateLimiter();

// Initialize connectors
const linkedIn = new LinkedInConnector(sessionManager, rateLimiter);
const indeed = new IndeedConnector(sessionManager, rateLimiter);
const wellfound = new WellfoundConnector(sessionManager, rateLimiter);
const browser = new GenericBrowserConnector(sessionManager, rateLimiter);

// CLI metadata
program
  .name('oktyv')
  .description('Universal browser automation platform')
  .version('0.2.0-alpha.1');

// ============================================================================
// LinkedIn Commands
// ============================================================================

const linkedin = program
  .command('linkedin')
  .description('LinkedIn automation tools');

linkedin
  .command('search')
  .description('Search for jobs on LinkedIn')
  .option('-k, --keywords <keywords>', 'Job title, skills, or keywords')
  .option('-l, --location <location>', 'City, state, or country')
  .option('-r, --remote', 'Filter for remote positions')
  .option('--limit <number>', 'Maximum results', '10')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const params: JobSearchParams = {
        keywords: options.keywords,
        location: options.location,
        remote: options.remote,
        limit: parseInt(options.limit),
      };

      console.log(chalk.blue('🔍 Searching LinkedIn jobs...'));
      const jobs = await linkedIn.searchJobs(params);
      
      if (options.json) {
        console.log(JSON.stringify(jobs, null, 2));
      } else {
        formatJobResults(jobs);
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

linkedin
  .command('job')
  .description('Get detailed job information')
  .requiredOption('-i, --id <jobId>', 'LinkedIn job ID')
  .option('-c, --company', 'Include company details')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📄 Fetching LinkedIn job details...'));
      const result = await linkedIn.getJob(options.id, options.company);
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        formatJob(result.job);
        if (result.company) {
          console.log('\n' + chalk.bold('Company Details:'));
          formatCompany(result.company);
        }
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

linkedin
  .command('company')
  .description('Get company information')
  .requiredOption('-i, --id <companyId>', 'LinkedIn company ID or vanity name')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🏢 Fetching LinkedIn company details...'));
      const company = await linkedIn.getCompany(options.id);
      
      if (options.json) {
        console.log(JSON.stringify(company, null, 2));
      } else {
        formatCompany(company);
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

// ============================================================================
// Indeed Commands
// ============================================================================

const indeedCmd = program
  .command('indeed')
  .description('Indeed automation tools');

indeedCmd
  .command('search')
  .description('Search for jobs on Indeed')
  .option('-k, --keywords <keywords>', 'Job title, skills, or keywords')
  .option('-l, --location <location>', 'City, state, or country')
  .option('-r, --remote', 'Filter for remote positions')
  .option('--limit <number>', 'Maximum results', '10')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const params: JobSearchParams = {
        keywords: options.keywords,
        location: options.location,
        remote: options.remote,
        limit: parseInt(options.limit),
      };

      console.log(chalk.blue('🔍 Searching Indeed jobs...'));
      const jobs = await indeed.searchJobs(params);
      
      if (options.json) {
        console.log(JSON.stringify(jobs, null, 2));
      } else {
        formatJobResults(jobs);
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

indeedCmd
  .command('job')
  .description('Get detailed job information')
  .requiredOption('-k, --key <jobKey>', 'Indeed job key')
  .option('-c, --company', 'Include company details')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📄 Fetching Indeed job details...'));
      const result = await indeed.getJob(options.key, options.company);
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        formatJob(result.job);
        if (result.company) {
          console.log('\n' + chalk.bold('Company Details:'));
          formatCompany(result.company);
        }
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

indeedCmd
  .command('company')
  .description('Get company information')
  .requiredOption('-n, --name <companyName>', 'Indeed company name')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🏢 Fetching Indeed company details...'));
      const company = await indeed.getCompany(options.name);
      
      if (options.json) {
        console.log(JSON.stringify(company, null, 2));
      } else {
        formatCompany(company);
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

// ============================================================================
// Wellfound Commands
// ============================================================================

const wellfoundCmd = program
  .command('wellfound')
  .description('Wellfound automation tools');

wellfoundCmd
  .command('search')
  .description('Search for jobs on Wellfound')
  .option('-k, --keywords <keywords>', 'Job title, skills, or keywords')
  .option('-l, --location <location>', 'City, state, or country')
  .option('-r, --remote', 'Filter for remote positions')
  .option('--limit <number>', 'Maximum results', '10')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const params: JobSearchParams = {
        keywords: options.keywords,
        location: options.location,
        remote: options.remote,
        limit: parseInt(options.limit),
      };

      console.log(chalk.blue('🔍 Searching Wellfound jobs...'));
      const jobs = await wellfound.searchJobs(params);
      
      if (options.json) {
        console.log(JSON.stringify(jobs, null, 2));
      } else {
        formatJobResults(jobs);
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

wellfoundCmd
  .command('job')
  .description('Get detailed job information')
  .requiredOption('-s, --slug <jobSlug>', 'Wellfound job slug')
  .option('-c, --company', 'Include company details')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📄 Fetching Wellfound job details...'));
      const result = await wellfound.getJob(options.slug, options.company);
      
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        formatJob(result.job);
        if (result.company) {
          console.log('\n' + chalk.bold('Company Details:'));
          formatCompany(result.company);
        }
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

wellfoundCmd
  .command('company')
  .description('Get company information')
  .requiredOption('-s, --slug <companySlug>', 'Wellfound company slug')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🏢 Fetching Wellfound company details...'));
      const company = await wellfound.getCompany(options.slug);
      
      if (options.json) {
        console.log(JSON.stringify(company, null, 2));
      } else {
        formatCompany(company);
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

// ============================================================================
// Generic Browser Commands
// ============================================================================

const browserCmd = program
  .command('browser')
  .description('Generic browser automation tools');

browserCmd
  .command('navigate')
  .description('Navigate to a URL')
  .requiredOption('-u, --url <url>', 'URL to navigate to')
  .option('-w, --wait <selector>', 'CSS selector to wait for')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log(chalk.blue(`🌐 Navigating to ${options.url}...`));
      await browser.navigate(options.url, { waitForSelector: options.wait });
      
      const result = { success: true, url: options.url };
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green('✅ Navigation successful'));
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

browserCmd
  .command('click')
  .description('Click an element')
  .requiredOption('-s, --selector <selector>', 'CSS selector')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      console.log(chalk.blue(`🖱️  Clicking ${options.selector}...`));
      await browser.click(options.selector);
      
      const result = { success: true, selector: options.selector };
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green('✅ Click successful'));
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

browserCmd
  .command('extract')
  .description('Extract data from page')
  .requiredOption('-s, --selectors <selectors>', 'JSON map of keys to CSS selectors')
  .option('-m, --multiple', 'Extract from all matching elements')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const selectors = JSON.parse(options.selectors);
      console.log(chalk.blue('📊 Extracting data...'));
      const data = await browser.extract(selectors, { multiple: options.multiple });
      
      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        formatGenericResult(data);
      }
      
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

browserCmd
  .command('screenshot')
  .description('Capture a screenshot')
  .option('-f, --full-page', 'Capture full page')
  .option('-s, --selector <selector>', 'Capture specific element')
  .option('-o, --output <file>', 'Output file (default: screenshot.png)')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📸 Capturing screenshot...'));
      const base64 = await browser.screenshot({ 
        fullPage: options.fullPage, 
        selector: options.selector 
      });
      
      const fs = await import('fs/promises');
      const outputFile = options.output || 'screenshot.png';
      await fs.writeFile(outputFile, Buffer.from(base64, 'base64'));
      
      console.log(chalk.green(`✅ Screenshot saved to ${outputFile}`));
      await cleanup();
    } catch (error: any) {
      console.error(chalk.red('❌ Error:'), error.message);
      await cleanup();
      process.exit(1);
    }
  });

// ============================================================================
// Cleanup
// ============================================================================

async function cleanup() {
  try {
    await sessionManager.closeAllSessions();
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n' + chalk.yellow('⚠️  Interrupted, cleaning up...'));
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

// Parse and execute
program.parse();
