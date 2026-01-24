# Oktyv CLI Usage Guide

Oktyv provides a command-line interface for all browser automation tools. This allows you to use Oktyv standalone without requiring MCP integration.

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run CLI
node dist/cli/index.js <command>

# Or link globally (optional)
npm link
oktyv <command>
```

## Command Structure

```bash
oktyv <connector> <tool> [options]
```

**Connectors:**
- `linkedin` - LinkedIn automation
- `indeed` - Indeed automation
- `wellfound` - Wellfound/AngelList automation
- `browser` - Generic browser automation (works with ANY website)

## LinkedIn Commands

### Search Jobs

```bash
# Basic search
oktyv linkedin search --keywords "Software Engineer" --location "San Francisco"

# Remote only
oktyv linkedin search --keywords "DevOps" --remote

# Limit results
oktyv linkedin search --keywords "Product Manager" --limit 20

# JSON output
oktyv linkedin search --keywords "Data Scientist" --json
```

**Options:**
- `-k, --keywords <keywords>` - Job title, skills, or keywords
- `-l, --location <location>` - City, state, or country
- `-r, --remote` - Filter for remote positions
- `--limit <number>` - Maximum results (default: 10)
- `--json` - Output as JSON (default: pretty table)

### Get Job Details

```bash
# Get job by ID
oktyv linkedin job --id "3847362891"

# Include company details
oktyv linkedin job --id "3847362891" --company

# JSON output
oktyv linkedin job --id "3847362891" --json
```

**Options:**
- `-i, --id <jobId>` - LinkedIn job ID (required)
- `-c, --company` - Include company details
- `--json` - Output as JSON

### Get Company Info

```bash
# Get company by ID or vanity name
oktyv linkedin company --id "anthropic"

# JSON output
oktyv linkedin company --id "google" --json
```

**Options:**
- `-i, --id <companyId>` - LinkedIn company ID or vanity name (required)
- `--json` - Output as JSON

## Indeed Commands

### Search Jobs

```bash
# Basic search
oktyv indeed search --keywords "Backend Engineer" --location "Austin, TX"

# Remote only
oktyv indeed search --keywords "Frontend Developer" --remote

# JSON output
oktyv indeed search --keywords "QA Engineer" --json
```

**Options:**
- `-k, --keywords <keywords>` - Job title, skills, or keywords
- `-l, --location <location>` - City, state, or country
- `-r, --remote` - Filter for remote positions
- `--limit <number>` - Maximum results (default: 10)
- `--json` - Output as JSON

### Get Job Details

```bash
# Get job by key
oktyv indeed job --key "abc123def456"

# Include company details
oktyv indeed job --key "abc123def456" --company

# JSON output
oktyv indeed job --key "abc123def456" --json
```

**Options:**
- `-k, --key <jobKey>` - Indeed job key (required)
- `-c, --company` - Include company details
- `--json` - Output as JSON

### Get Company Info

```bash
# Get company by name
oktyv indeed company --name "Microsoft"

# JSON output
oktyv indeed company --name "Apple" --json
```

**Options:**
- `-n, --name <companyName>` - Indeed company name (required)
- `--json` - Output as JSON

## Wellfound Commands

### Search Jobs

```bash
# Basic search
oktyv wellfound search --keywords "Full Stack" --location "New York"

# Remote only
oktyv wellfound search --keywords "Machine Learning" --remote

# JSON output
oktyv wellfound search --keywords "Blockchain" --json
```

**Options:**
- `-k, --keywords <keywords>` - Job title, skills, or keywords
- `-l, --location <location>` - City, state, or country
- `-r, --remote` - Filter for remote positions
- `--limit <number>` - Maximum results (default: 10)
- `--json` - Output as JSON

### Get Job Details

```bash
# Get job by slug
oktyv wellfound job --slug "senior-engineer-at-awesome-startup"

# Include company details
oktyv wellfound job --slug "senior-engineer-at-awesome-startup" --company

# JSON output
oktyv wellfound job --slug "senior-engineer-at-awesome-startup" --json
```

**Options:**
- `-s, --slug <jobSlug>` - Wellfound job slug (required)
- `-c, --company` - Include company details
- `--json` - Output as JSON

### Get Company Info

```bash
# Get company by slug
oktyv wellfound company --slug "anthropic"

# JSON output
oktyv wellfound company --slug "openai" --json
```

**Options:**
- `-s, --slug <companySlug>` - Wellfound company slug (required)
- `--json` - Output as JSON

## Generic Browser Commands

These commands work with **ANY website**, not just job boards.

### Navigate

```bash
# Navigate to a URL
oktyv browser navigate --url "https://example.com"

# Wait for specific element to load
oktyv browser navigate --url "https://example.com" --wait "#content"

# JSON output
oktyv browser navigate --url "https://example.com" --json
```

**Options:**
- `-u, --url <url>` - URL to navigate to (required)
- `-w, --wait <selector>` - CSS selector to wait for
- `--json` - Output as JSON

### Click Element

```bash
# Click an element
oktyv browser click --selector "#submit-button"

# JSON output
oktyv browser click --selector ".login-btn" --json
```

**Options:**
- `-s, --selector <selector>` - CSS selector (required)
- `--json` - Output as JSON

### Extract Data

```bash
# Extract data from page
oktyv browser extract --selectors '{"title":"h1","price":".price"}'

# Extract multiple matching elements
oktyv browser extract --selectors '{"items":".product"}' --multiple

# JSON output
oktyv browser extract --selectors '{"name":"h1"}' --json
```

**Options:**
- `-s, --selectors <selectors>` - JSON map of keys to CSS selectors (required)
- `-m, --multiple` - Extract from all matching elements
- `--json` - Output as JSON

**Example selectors:**
```json
{
  "title": "h1",
  "price": ".price-tag",
  "description": "#product-desc",
  "reviews": ".review-count"
}
```

### Capture Screenshot

```bash
# Screenshot current page
oktyv browser screenshot

# Full page screenshot
oktyv browser screenshot --full-page

# Screenshot specific element
oktyv browser screenshot --selector "#main-content"

# Custom output file
oktyv browser screenshot --output "mypage.png"
```

**Options:**
- `-f, --full-page` - Capture entire scrollable page
- `-s, --selector <selector>` - Capture specific element only
- `-o, --output <file>` - Output filename (default: screenshot.png)

## Output Formats

### Pretty Output (Default)

The CLI provides formatted, colorful output with tables and emoji:

```
✅ Found 5 jobs:

┌────────────────────────┬─────────────────┬──────────────────┬──────────┬─────────────┐
│ Title                  │ Company         │ Location         │ Type     │ Posted      │
├────────────────────────┼─────────────────┼──────────────────┼──────────┼─────────────┤
│ Senior Software Eng... │ Anthropic       │ 🌍 Remote       │ FULL_... │ 2 days ago  │
│ Product Manager        │ OpenAI          │ San Francisco... │ FULL_... │ 5 days ago  │
└────────────────────────┴─────────────────┴──────────────────┴──────────┴─────────────┘
```

### JSON Output

Use `--json` flag for machine-readable output:

```json
{
  "jobs": [
    {
      "id": "3847362891",
      "title": "Senior Software Engineer",
      "company": "Anthropic",
      "location": {
        "city": "San Francisco",
        "state": "CA",
        "country": "USA",
        "locationType": "REMOTE"
      },
      "type": "FULL_TIME",
      "postedDate": "2026-01-22T00:00:00.000Z"
    }
  ]
}
```

## Workflow Examples

### Job Search Workflow

```bash
# 1. Search for jobs
oktyv linkedin search --keywords "ML Engineer" --location "Remote" --remote

# 2. Get details for specific job (copy ID from search results)
oktyv linkedin job --id "3847362891" --company

# 3. Research the company
oktyv linkedin company --id "anthropic"
```

### Web Scraping Workflow

```bash
# 1. Navigate to target site
oktyv browser navigate --url "https://example.com/products"

# 2. Extract product data
oktyv browser extract --selectors '{"name":"h2.product-name","price":".price"}' --multiple

# 3. Capture screenshot as reference
oktyv browser screenshot --output "products-page.png"
```

### Multi-Platform Job Search

```bash
# Search across all three platforms
oktyv linkedin search --keywords "DevOps" --remote --limit 10 --json > linkedin.json
oktyv indeed search --keywords "DevOps" --remote --limit 10 --json > indeed.json
oktyv wellfound search --keywords "DevOps" --remote --limit 10 --json > wellfound.json

# Combine and analyze results with jq or your favorite tool
```

## Tips & Best Practices

### Rate Limiting

Each platform has different rate limits:
- LinkedIn: 10 requests/minute
- Indeed: 20 requests/minute
- Wellfound: 15 requests/minute

The CLI automatically handles rate limiting, but be patient if you make many requests.

### Error Handling

The CLI provides descriptive error messages:

```bash
❌ Error: Failed to navigate to https://example.com
# Check your internet connection, URL validity, etc.
```

### Session Management

The CLI automatically manages browser sessions and cleans up on exit. If interrupted (Ctrl+C), it will gracefully close all browser instances.

### Debugging

Set environment variables for debugging:

```bash
# Enable verbose logging
DEBUG=oktyv:* node dist/cli/index.js linkedin search --keywords "test"
```

## Advanced Usage

### Piping and Filtering

```bash
# Extract job titles only
oktyv linkedin search --keywords "Engineer" --json | jq '.jobs[].title'

# Count remote jobs
oktyv indeed search --remote --json | jq '.jobs | length'

# Filter by salary
oktyv wellfound search --keywords "ML" --json | jq '.jobs[] | select(.salary.min > 150000)'
```

### Scripting

```bash
#!/bin/bash
# Save to job-search.sh

KEYWORDS="Senior Engineer"
LOCATION="San Francisco"

echo "Searching LinkedIn..."
oktyv linkedin search --keywords "$KEYWORDS" --location "$LOCATION" --json > linkedin-results.json

echo "Searching Indeed..."
oktyv indeed search --keywords "$KEYWORDS" --location "$LOCATION" --json > indeed-results.json

echo "Search complete! Results saved to *-results.json"
```

## Troubleshooting

### CLI Not Found

```bash
# Make sure you built the project
npm run build

# Run from project directory
node dist/cli/index.js <command>

# Or link globally
npm link
```

### Browser Launch Fails

```bash
# Make sure Puppeteer dependencies are installed
# On Ubuntu/Debian:
sudo apt-get install -y chromium-browser

# On macOS:
# Puppeteer should download Chromium automatically
```

### TypeScript Errors

```bash
# Rebuild the project
npm run build

# Check for compilation errors
npm run typecheck
```

## Getting Help

```bash
# General help
oktyv --help

# Connector-specific help
oktyv linkedin --help
oktyv indeed --help
oktyv wellfound --help
oktyv browser --help

# Tool-specific help
oktyv linkedin search --help
oktyv browser extract --help
```

## Version

```bash
# Check CLI version
oktyv --version
```

---

**Next Steps:**
- See [CURRENT_STATUS.md](./CURRENT_STATUS.md) for project status
- See [ROADMAP.md](./ROADMAP.md) for future plans
- Report issues on GitHub
