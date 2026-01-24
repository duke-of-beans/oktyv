/**
 * CLI Output Formatters
 * 
 * Pretty-print output for CLI commands with colors and tables.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import type { Job } from '../types/job.js';
import type { Company } from '../types/company.js';

/**
 * Format job search results as a table
 */
export function formatJobResults(jobs: Job[]): void {
  if (jobs.length === 0) {
    console.log(chalk.yellow('⚠️  No jobs found'));
    return;
  }

  console.log(chalk.green(`\n✅ Found ${jobs.length} job${jobs.length === 1 ? '' : 's'}:\n`));

  const table = new Table({
    head: [
      chalk.cyan('Title'),
      chalk.cyan('Company'),
      chalk.cyan('Location'),
      chalk.cyan('Type'),
      chalk.cyan('Posted'),
    ],
    colWidths: [30, 25, 25, 15, 15],
    wordWrap: true,
  });

  for (const job of jobs) {
    table.push([
      job.title,
      job.company || 'N/A',
      formatLocation(job),
      job.type || 'N/A',
      job.postedDate ? formatDate(job.postedDate) : 'N/A',
    ]);
  }

  console.log(table.toString());
  
  // Show ID for reference
  console.log(chalk.dim('\nJob IDs:'));
  jobs.forEach((job, idx) => {
    console.log(chalk.dim(`${idx + 1}. ${job.title}: ${job.id}`));
  });
}

/**
 * Format a single job's detailed information
 */
export function formatJob(job: Job): void {
  console.log('\n' + chalk.bold.green('📄 Job Details'));
  console.log(chalk.dim('─'.repeat(60)));

  // Header
  console.log(chalk.bold.cyan(job.title));
  if (job.company) {
    console.log(chalk.gray(`at ${job.company}`));
  }
  console.log('');

  // Basic info table
  const basicTable = new Table({
    colWidths: [20, 40],
  });

  basicTable.push(
    ['Location', formatLocation(job)],
    ['Job Type', job.type || 'Not specified'],
    ['Experience', job.experienceLevel || 'Not specified'],
    ['Posted', job.postedDate ? formatDate(job.postedDate) : 'Unknown'],
  );

  if (job.salary) {
    basicTable.push(['Salary', formatSalary(job.salary)]);
  }

  if (job.applicantCount !== undefined) {
    basicTable.push(['Applicants', job.applicantCount.toString()]);
  }

  console.log(basicTable.toString());

  // Description
  if (job.description) {
    console.log('\n' + chalk.bold('Description:'));
    console.log(chalk.dim('─'.repeat(60)));
    // Strip HTML tags for CLI display
    const plainText = job.description.replace(/<[^>]*>/g, '');
    console.log(plainText.slice(0, 500) + (plainText.length > 500 ? '...' : ''));
  }

  // Skills
  if (job.skills && job.skills.length > 0) {
    console.log('\n' + chalk.bold('Required Skills:'));
    console.log(job.skills.map(s => chalk.cyan(`• ${s}`)).join('\n'));
  }

  // Requirements
  if (job.requirements && job.requirements.length > 0) {
    console.log('\n' + chalk.bold('Requirements:'));
    console.log(job.requirements.map(r => chalk.yellow(`• ${r}`)).join('\n'));
  }

  // Benefits
  if (job.benefits && job.benefits.length > 0) {
    console.log('\n' + chalk.bold('Benefits:'));
    console.log(job.benefits.map(b => chalk.green(`• ${b}`)).join('\n'));
  }

  // Job URL
  if (job.url) {
    console.log('\n' + chalk.bold('Apply:'));
    console.log(chalk.blue.underline(job.url));
  }

  console.log(chalk.dim('─'.repeat(60)));
}

/**
 * Format company information
 */
export function formatCompany(company: Company): void {
  console.log('\n' + chalk.bold.green('🏢 Company Details'));
  console.log(chalk.dim('─'.repeat(60)));

  // Header
  console.log(chalk.bold.cyan(company.name));
  if (company.tagline) {
    console.log(chalk.gray(company.tagline));
  }
  console.log('');

  // Basic info table
  const table = new Table({
    colWidths: [20, 40],
  });

  if (company.industry) {
    table.push(['Industry', company.industry]);
  }

  if (company.size) {
    table.push(['Company Size', company.size]);
  }

  if (company.employeeCount) {
    table.push(['Employees', company.employeeCount.toString()]);
  }

  if (company.founded) {
    table.push(['Founded', company.founded.toString()]);
  }

  if (company.headquarters) {
    table.push(['Headquarters', formatCompanyLocation(company.headquarters)]);
  }

  if (company.website) {
    table.push(['Website', chalk.blue.underline(company.website)]);
  }

  // Startup-specific funding info
  if (company.funding?.stage) {
    table.push(['Funding Stage', chalk.magenta(company.funding.stage)]);
  }

  if (company.funding?.totalRaised) {
    table.push(['Total Raised', chalk.green(`${company.funding.currency || '$'}${company.funding.totalRaised}`)]);
  }

  if (company.followerCount !== undefined) {
    table.push(['Followers', formatNumber(company.followerCount)]);
  }

  console.log(table.toString());

  // Description
  if (company.description) {
    console.log('\n' + chalk.bold('About:'));
    console.log(chalk.dim('─'.repeat(60)));
    console.log(company.description.slice(0, 500) + (company.description.length > 500 ? '...' : ''));
  }

  // Specialties
  if (company.specialties && company.specialties.length > 0) {
    console.log('\n' + chalk.bold('Specialties:'));
    console.log(company.specialties.map(s => chalk.cyan(`• ${s}`)).join('\n'));
  }

  console.log(chalk.dim('─'.repeat(60)));
}

/**
 * Format generic extraction results
 */
export function formatGenericResult(data: Record<string, string | string[]>): void {
  console.log('\n' + chalk.bold.green('📊 Extracted Data'));
  console.log(chalk.dim('─'.repeat(60)));

  for (const [key, value] of Object.entries(data)) {
    console.log(chalk.bold.cyan(key + ':'));
    
    if (Array.isArray(value)) {
      if (value.length === 0) {
        console.log(chalk.gray('  (no data)'));
      } else {
        value.forEach((item, idx) => {
          console.log(chalk.gray(`  ${idx + 1}. ${item}`));
        });
      }
    } else {
      console.log(chalk.gray(`  ${value || '(empty)'}`));
    }
    
    console.log('');
  }

  console.log(chalk.dim('─'.repeat(60)));
}

/**
 * Helper: Format job location
 */
function formatLocation(job: Job): string {
  const parts: string[] = [];

  if (job.location?.city) parts.push(job.location.city);
  if (job.location?.state) parts.push(job.location.state);
  if (job.location?.country) parts.push(job.location.country);

  let location = parts.join(', ') || 'Unknown';

  if (job.location?.locationType === 'REMOTE') {
    location = '🌍 Remote' + (parts.length > 0 ? ` (${location})` : '');
  } else if (job.location?.locationType === 'HYBRID') {
    location = '🏢/🏠 Hybrid - ' + location;
  }

  return location;
}

/**
 * Helper: Format company headquarters location
 */
function formatCompanyLocation(location: { city?: string; state?: string; country?: string }): string {
  const parts: string[] = [];

  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);
  if (location.country) parts.push(location.country);

  return parts.join(', ') || 'Unknown';
}

/**
 * Helper: Format salary range
 */
function formatSalary(salary: { min?: number; max?: number; currency?: string; period?: string }): string {
  const currency = salary.currency || 'USD';
  const period = salary.period || 'year';

  if (salary.min && salary.max) {
    return `${currency} ${formatNumber(salary.min)} - ${formatNumber(salary.max)} per ${period}`;
  } else if (salary.min) {
    return `${currency} ${formatNumber(salary.min)}+ per ${period}`;
  } else if (salary.max) {
    return `Up to ${currency} ${formatNumber(salary.max)} per ${period}`;
  }

  return 'Not specified';
}

/**
 * Helper: Format date
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  
  return date.toLocaleDateString();
}

/**
 * Helper: Format large numbers with K/M/B suffixes
 */
function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1) + 'B';
  } else if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toString();
}
