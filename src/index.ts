import { type GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { program } from 'commander';
import dotenv from 'dotenv';
import ora from 'ora';
import { type SimpleGit, simpleGit } from 'simple-git';

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
}

// Setup CLI options
program
  .version('1.0.0')
  .option('-c, --commit <hash>', 'Compare with specific commit')
  .option('-b, --branch <name>', 'Compare with branch')
  .option('-l, --last', 'Compare with last commit (default)')
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

    if (options.commit) {
      // For specific commit
      try {
        diff = await git.diff([options.commit]);
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
        diff = await git.diff([`origin/${options.branch}`]);
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
        diff = await git.diff([emptyTree, 'HEAD']);
      } else {
        // Normal case - compare with previous commit
        diff = await git.diff(['HEAD^', 'HEAD']);
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

async function getAiReview(diff: string): Promise<string> {
  try {
    const prompt = `
    You are a veteran code reviewer with decades of experience, specializing in ruthless but precise critique. Analyze the following git diff with surgical precision. For each code change:

1. Reference specific line numbers
2. Identify critical issues first:
   - Logic errors and edge cases
   - Performance bottlenecks and complexity problems
   - Design flaws and architectural mistakes
   - Maintainability concerns
   - Poor abstractions or patterns

3. Then address secondary concerns:
   - Naming conventions
   - Code style inconsistencies
   - Missing comments or documentation
   - Test coverage gaps

    For each identified issue:
    - Provide the exact location (file:line)
    - Explain precisely why it's problematic
    - Show a concrete code fix in a diff-like format:
      diff
    - problematic code
      + improved code
    Briefly explain why your solution is better

    Be brutally honest but technically sound - focus on substance over style. Prioritize serious problems that affect functionality, performance, or maintainability. Skip trivial issues if there are major concerns to address.
${diff}

      `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return await formatReviewSection(response.text());
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
    if (!options.commit && !options.branch && !options.last) {
      program.help();
      return;
    }

    // Get the diff based on provided options
    const spinner = ora('Fetching git diff...').start();
    const diff = await getDiff(options);

    if (!diff) {
      spinner.fail(styles.warning('No changes found to review.'));
      process.exit(0);
    }
    spinner.succeed(styles.success('Git diff retrieved successfully'));

    // Get AI review
    spinner.start('Analyzing code changes with AI...');
    try {
      const review = await getAiReview(diff);
      spinner.succeed(styles.success('AI review completed'));

      // Output header and review
      console.log(styles.header('\nCODE REVIEW RESULTS\n'));
      console.log(styles.info('='.repeat(50)));
      console.log(review);
      console.log(styles.info('='.repeat(50)));
      console.log(styles.success('\nReview completed successfully!\n'));
    } catch (aiError) {
      const err = aiError as Error;
      spinner.fail(styles.error('AI Review Failed'));
      console.error(styles.error('Error getting AI review:'), err.message);
      console.error(styles.warning('The diff was retrieved successfully, but the AI review failed.'));
      process.exit(1);
    }
  } catch (error) {
    const err = error as Error;
    console.error(styles.error('Error:'), err.message || err);
    process.exit(1);
  }
}

main();
