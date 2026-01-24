# Oktyv CLI Guide

The Oktyv CLI provides standalone access to all browser automation tools without requiring MCP integration.

## Installation

```bash
# Install globally
npm install -g oktyv

# Or run from project directory
cd oktyv
npm run build
node dist/cli/index.js
```

## Quick Start

```bash
# Search for jobs on LinkedIn
oktyv linkedin search --keywords "software engineer" --location "San Francisco" --limit 10

# Get job details
oktyv linkedin job --id 3847362891 --company

# Search Indeed
oktyv indeed search --keywords "data scientist" --remote --json

# Extract data from any website
oktyv browser navigate --url https://example.com
oktyv browser extract --selectors '{"title":"h1","price":".price"}'
oktyv browser screenshot --output example.png
```

## Commands

### LinkedIn

**Search for jobs:**
```bash
oktyv linkedin search [options]

Options:
  -k, --keywords <keywords>   Job title, skills, or keywords
  -l, --location <location>   City, state, or country
  -r, --remote                Filter for remote positions
  --limit <number>            Maximum results (default: 10)
  --json                      Output as JSON
```

**Get job details:**
```bash
oktyv linkedin job [options]

Options:
  -i, --id <jobId>            LinkedIn job ID (required)
  -c, --company               Include company details
  --json                      Output as JSON
```

**Get company info:**
```bash
oktyv linkedin company [options]

Options:
  -i, --id <companyId>        LinkedIn company ID or vanity name (required)
  --json                      Output as JSON
```

### Indeed

**Search for jobs:**
```bash
oktyv indeed search [options]

Options:
  -k, --keywords <keywords>   Job title, skills, or keywords
  -l, --location <location>   City, state, or country
  -r, --remote                Filter for remote positions
  --limit <number>            Maximum results (default: 10)
  --json                      Output as JSON
```

**Get job details:**
```bash
oktyv indeed job [options]

Options:
  -k, --key <jobKey>          Indeed job key (required)
  -c, --company               Include company details
  --json                      Output as JSON
```

**Get company info:**
```bash
oktyv indeed company [options]

Options:
  -n, --name <companyName>    Indeed company name (required)
  --json                      Output as JSON
```

### Wellfound

**Search for jobs:**
```bash
oktyv wellfound search [options]

Options:
  -k, --keywords <keywords>   Job title, skills, or keywords
  -l, --location <location>   City, state, or country
  -r, --remote                Filter for remote positions
  --limit <number>            Maximum results (default: 10)
  --json                      Output as JSON
```

**Get job details:**
```bash
oktyv wellfound job [options]

Options:
  -s, --slug <jobSlug>        Wellfound job slug (required)
  -c, --company               Include company details
  --json                      Output as JSON
```

**Get company info:**
```bash
oktyv wellfound company [options]

Options:
  -s, --slug <companySlug>    Wellfound company slug (required)
  --json                      Output as JSON
```

### Generic Browser

**Navigate to URL:**
```bash
oktyv browser navigate [options]

Options:
  -u, --url <url>             URL to navigate to (required)
  -w, --wait <selector>       CSS selector to wait for
  --json                      Output as JSON
```

**Click element:**
```bash
oktyv browser click [options]

Options:
  -s, --selector <selector>   CSS selector (required)
  --json                      Output as JSON
```

**Extract data:**
```bash
oktyv browser extract [options]

Options:
  -s, --selectors <selectors> JSON map of keys to CSS selectors (required)
  -m, --multiple              Extract from all matching elements
  --json                      Output as JSON
  
Example:
  oktyv browser extract --selectors '{"title":"h1","price":".price"}'
```

**Capture screenshot:**
```bash
oktyv browser screenshot [options]

Options:
  -f, --full-page             Capture full page
  -s, --selector <selector>   Capture specific element
  -o, --output <file>         Output file (default: screenshot.png)
```

## Output Formats

### Table Format (Default)
Human-readable tables with colors:
```bash
oktyv linkedin search --keywords "engineer" --location "SF"
```

### JSON Format
Machine-readable JSON for scripting:
```bash
oktyv linkedin search --keywords "engineer" --json | jq '.jobs[] | {title, company}'
```

## Examples

### Job Search Workflow
```bash
# Search for jobs
oktyv linkedin search --keywords "senior software engineer" --location "San Francisco" --remote > jobs.json

# Get details for specific job
oktyv linkedin job --id 3847362891 --company --json

# Extract job URLs
oktyv linkedin search --keywords "engineer" --json | jq -r '.jobs[].url'
```

### Web Scraping
```bash
# Navigate and extract
oktyv browser navigate --url https://example.com --wait ".content"
oktyv browser extract --selectors '{"title":"h1","description":"p.desc","price":".price"}' --json

# Take screenshot
oktyv browser navigate --url https://example.com
oktyv browser screenshot --full-page --output example.png
```

### Automation Script
```bash
#!/bin/bash
# Search all platforms and combine results

oktyv linkedin search --keywords "$1" --json > linkedin.json
oktyv indeed search --keywords "$1" --json > indeed.json  
oktyv wellfound search --keywords "$1" --json > wellfound.json

jq -s 'map(.jobs) | add' linkedin.json indeed.json wellfound.json > all-jobs.json
```

## Tips

1. **Use JSON output for scripting**: Add `--json` to pipe results to other tools
2. **Combine with jq**: Process JSON output with `jq` for powerful filtering
3. **Rate limiting**: Tools respect platform rate limits automatically
4. **Session cleanup**: Press Ctrl+C to gracefully close browser sessions
5. **Verbose logging**: Set `LOG_LEVEL=debug` for detailed logs

## Troubleshooting

### Browser not closing
- Always use Ctrl+C to stop CLI (not Ctrl+Z or kill)
- Browser sessions cleanup automatically on exit

### Rate limit errors
- Tools include built-in rate limiting
- LinkedIn: 10 requests/minute
- Indeed: 20 requests/minute
- Wellfound: 15 requests/minute

### Command not found
```bash
# Link locally
npm link

# Or use full path
node dist/cli/index.js
```

## Advanced Usage

### Custom Browser Options
Coming soon: Configuration file support

### Shell Completion
Coming soon: Bash/Zsh completion scripts

## Support

- GitHub Issues: https://github.com/duke-of-beans/oktyv/issues
- Documentation: https://github.com/duke-of-beans/oktyv/blob/main/README.md
