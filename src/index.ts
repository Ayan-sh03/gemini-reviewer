import chalk from 'chalk';
import dotenv from 'dotenv';
import ora from 'ora';
import { getAiReview } from './ai-reviewer.js';
import { parseCommandLineArgs } from './cli.js';
import { getDiff } from './git.js';
import { handleReviewOutput } from './output.js';

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

async function main(): Promise<void> {
  try {
    console.log(styles.header('\nGit Diff Reviewer powered by Gemini AI\n'));

    // Parse command line arguments
    const options = parseCommandLineArgs();

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

    // Get AI review
    spinner.start('Analyzing code changes with AI...');
    let review: string;
    try {
      review = await getAiReview(diff, options);
      spinner.succeed(styles.success('AI review completed'));
    } catch (aiError) {
      spinner.fail(styles.error('AI Review Failed'));
      const err = aiError as Error;
      console.error(styles.error('Error getting AI review:'), err.message);
      console.error(styles.warning('The diff was retrieved successfully, but the AI review failed.'));
      process.exit(1);
    }

    // Handle output
    spinner.start('Formatting review output...');
    try {
      await handleReviewOutput(review, options);
      spinner.succeed(styles.success('Review formatted successfully'));
    } catch (err) {
      spinner.fail(styles.error('Failed to format review output'));
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
