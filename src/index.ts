import { type GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { program } from 'commander';
import crypto from 'crypto';
import dotenv from 'dotenv';
import ora from 'ora';
import { type SimpleGit, simpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
// Load environment variables
dotenv.config();

// Console styling
const styles = {
  header: chalk.bold.cyan,
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.cyan,
  section: chalk.blue,
  code: chalk.blue.dim,
};

const git: SimpleGit = simpleGit();

// Initialize the Google AI client
const genAi = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? '');
const model: GenerativeModel = genAi.getGenerativeModel({
  model: process.env.MODEL_ID ?? 'gemini-2.5-flash-preview-04-17',
});

interface ProgramOptions {
  commit?: string;
  branch?: string;
  last?: boolean;
  output?: string;
  exclude?: string[];
  focus?: string[];
  ignore?: string[];
  template?: string;
}

// Setup CLI options
program
  .version('1.0.0')
  .option('-c, --commit <hash>', 'Compare with specific commit')
  .option('-b, --branch <name>', 'Compare with branch')
  .option('-l, --last', 'Compare with last commit (default)')
  .option('-o, --output <file>', 'Write review output to a file')
  .option('--exclude <patterns...>', 'Exclude files/directories matching these patterns')
  .option('--focus <areas...>', 'Focus review on specific areas (e.g., security, performance)')
  .option('--ignore <areas...>', 'Ignore specific areas in review')
  .option('--template <name>', 'Use a specific review template (default, security, performance)')
  .parse(process.argv);

const options: ProgramOptions = program.opts();

async function getDiff(options: ProgramOptions): Promise<string> {
  try {
    let diff: string;
    const hasCommits = await git.raw(['rev-list', 'HEAD', '--count']);
    const commitCount = Number.parseInt(hasCommits.trim());

    if (commitCount === 0) {
      console.log('No commits found in the repository.');
      return '';
    }

    // Prepare exclude patterns
    const excludeArgs = options.exclude?.flatMap(pattern => [':(exclude)', pattern]) ?? [];

    if (options.commit) {
      // For specific commit
      try {
        diff = await git.diff([...excludeArgs, options.commit]);
      } catch (_err) {
        console.error(`Error: Invalid commit hash or commit not found: ${options.commit}`);
        process.exit(1);
      }
    } else if (options.branch) {
      // For branch comparison
      try {
        const branches = await git.branch();
        if (!branches.all.includes(`remotes/origin/${options.branch}`)) {
          console.error(`Error: Branch 'origin/${options.branch}' not found`);
          process.exit(1);
        }
        diff = await git.diff([...excludeArgs, `origin/${options.branch}`]);
      } catch (err) {
        const error = err as Error;
        console.error(`Error accessing branch: ${error.message}`);
        process.exit(1);
      }
    } else {
      // Default to last commit
      if (commitCount === 1) {
        // For the first commit, compare with empty tree
        const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'; // Git empty tree hash
        diff = await git.diff([...excludeArgs, emptyTree, 'HEAD']);
      } else {
        // Normal case - compare with previous commit
        diff = await git.diff([...excludeArgs, 'HEAD^', 'HEAD']);
      }
    }

    return diff || '';
  } catch (error) {
    const err = error as Error;
    console.error('Error getting git diff:', err.message);
    process.exit(1);
  }
}

// Format and style the review sections
async function formatReviewSection(text: string): Promise<string> {
  const sections = text.split('\n\n');
  let formatted = '';

  for (const section of sections) {
    if (section.trim()) {
      formatted += `\n${styles.section(section.trim())}\n`;
    }
  }

  return formatted;
}

function stripAnsiCodes(str: string): string {
  return str.replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '');
}

// Cache configuration
const CACHE_DIR = '.gitreview-cache';
const CACHE_VERSION = '1'; // Increment this when prompt format changes

interface CacheEntry {
  version: string;
  modelId: string;
  template: string;
  focus?: string[];
  ignore?: string[];
  review: string;
}

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

// Generate a unique hash for the diff and review configuration
function generateCacheKey(diff: string, options: ProgramOptions): string {
  const configString = JSON.stringify({
    diff,
    template: options.template,
    focus: options.focus,
    ignore: options.ignore,
    modelId: process.env.MODEL_ID,
    version: CACHE_VERSION,
  });
  return crypto.createHash('sha256').update(configString).digest('hex');
}

// Try to get a cached review
async function getCachedReview(cacheKey: string): Promise<string | null> {
  try {
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const cacheContent = await fs.promises.readFile(cachePath, 'utf-8');
    const cache: CacheEntry = JSON.parse(cacheContent);

    // Validate cache entry
    if (
      cache.version !== CACHE_VERSION ||
      cache.modelId !== process.env.MODEL_ID ||
      cache.template !== (options.template || 'default') ||
      JSON.stringify(cache.focus) !== JSON.stringify(options.focus) ||
      JSON.stringify(cache.ignore) !== JSON.stringify(options.ignore)
    ) {
      return null;
    }

    return cache.review;
  } catch (err) {
    console.error(styles.warning('Cache read error:'), (err as Error).message);
    return null;
  }
}

// Save a review to cache
async function cacheReview(cacheKey: string, review: string): Promise<void> {
  try {
    const cacheEntry: CacheEntry = {
      version: CACHE_VERSION,
      modelId: process.env.MODEL_ID ?? '',
      template: options.template || 'default',
      focus: options.focus,
      ignore: options.ignore,
      review,
    };

    const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
    await fs.promises.writeFile(cachePath, JSON.stringify(cacheEntry, null, 2));
  } catch (err) {
    console.error(styles.warning('Cache write error:'), (err as Error).message);
  }
}

// Load a prompt template and substitute variables
async function loadTemplate(templateName: string = 'default'): Promise<string> {
  try {
    const templatePath = path.join('prompts', `${templateName}.txt`);
    return await fs.promises.readFile(templatePath, 'utf-8');
  } catch (err) {
    console.error(styles.error(`Failed to load template '${templateName}'. Using default template.`));
    const defaultPath = path.join('prompts', 'default.txt');
    return await fs.promises.readFile(defaultPath, 'utf-8');
  }
}

async function getAiReview(diff: string): Promise<string> {
  try {
    // Check cache first
    const cacheKey = generateCacheKey(diff, options);
    const cachedReview = await getCachedReview(cacheKey);

    if (cachedReview) {
      console.log(styles.info('\nUsing cached review result'));
      return cachedReview;
    }

    // Load the appropriate template
    const template = await loadTemplate(options.template);

    // Construct focus and ignore instructions
    const focusInstructions = options.focus?.length
      ? `\nSpecifically focus on and prioritize these areas in your review:\n${options.focus.map(area => `- ${area}`).join('\n')}`
      : '';

    const ignoreInstructions = options.ignore?.length
      ? `\nSkip or minimize attention to these areas unless critical:\n${options.ignore.map(area => `- ${area}`).join('\n')}`
      : '';

    // Replace template variables
    const prompt = template
      .replace('${diff}', diff)
      .replace('${focusInstructions}', focusInstructions)
      .replace('${ignoreInstructions}', ignoreInstructions);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const review = await formatReviewSection(response.text());

    // Cache the review result
    await cacheReview(cacheKey, review);

    return review;
  } catch (error) {
    const err = error as Error;
    console.error('Error getting AI review:', err);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    console.log(styles.header('\nGit Diff Reviewer powered by Gemini AI\n'));

    // Show help if no options provided
    if (!options.commit && !options.branch && !options.last && !options.output) {
      program.help();
    }

    // Set default option to --last if no other options are provided
    if (!options.commit && !options.branch && !options.last) {
      options.last = true;
    }

    // Get the diff based on provided options
    const spinner = ora('Fetching git diff...').start();
    let diff: string;
    try {
      diff = await getDiff(options);
      spinner.succeed(styles.success('Git diff retrieved successfully'));
    } catch (err) {
      spinner.fail(styles.error('Failed to fetch git diff'));
      console.error(styles.error((err as Error).message));
      process.exit(1);
    }

    if (!diff) {
      spinner.fail(styles.warning('No changes found to review.'));
      process.exit(0);
    }

    spinner.start('Analyzing code changes with AI...');
    let review: string;
    try {
      review = await getAiReview(diff);
      spinner.succeed(styles.success('AI review completed'));
    } catch (aiError) {
      spinner.fail(styles.error('AI Review Failed'));
      const err = aiError as Error;
      console.error(styles.error('Error getting AI review:'), err.message);
      console.error(styles.warning('The diff was retrieved successfully, but the AI review failed.'));
      process.exit(1);
    }

    spinner.start('Formatting review output...');
    try {
      // Output header and review
      if (options.output) {
        // Strip ANSI codes from both review content and any styling
        const formattedReview = `CODE REVIEW RESULTS\n\n${review}`;
        const cleanReview = stripAnsiCodes(formattedReview);
        await fs.promises.writeFile(options.output, cleanReview, 'utf-8');
        spinner.succeed(styles.success(`Review written to file: ${options.output}`));
      } else {
        spinner.succeed(styles.success('Review formatted successfully'));
        console.log(styles.header('\nCODE REVIEW RESULTS\n'));
        console.log(styles.info('='.repeat(50)));
        console.log(review);
        console.log(styles.info('='.repeat(50)));
        console.log(styles.success('\nReview completed successfully!\n'));
      }
    } catch (err) {
      spinner.fail(styles.error('Failed to write or format review output'));
      console.error(styles.error((err as Error).message));
      process.exit(1);
    }
  } catch (error) {
    const err = error as Error;
    console.error(styles.error('Error:'), err.message || err);
    process.exit(1);
  }
}

main();
