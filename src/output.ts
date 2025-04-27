import fs from 'node:fs';
import chalk from 'chalk';
import type { ProgramOptions } from './review-cache.js';
import { stripAnsiCodes } from './utils.js';

/**
 * Handle the review output - either write to file or display in console
 */
export async function handleReviewOutput(review: string, options: ProgramOptions): Promise<void> {
  try {
    if (options.output) {
      // Strip ANSI codes from both review content and any styling
      const formattedReview = `CODE REVIEW RESULTS\n\n${review}`;
      const cleanReview = stripAnsiCodes(formattedReview);
      await fs.promises.writeFile(options.output, cleanReview, 'utf-8');
      console.log(chalk.green(`Review written to file: ${options.output}`));
    } else {
      console.log(chalk.bold.cyan('\nCODE REVIEW RESULTS\n'));
      console.log(chalk.cyan('='.repeat(50)));
      console.log(review);
      console.log(chalk.cyan('='.repeat(50)));
      console.log(chalk.green('\nReview completed successfully!\n'));
    }
  } catch (err) {
    console.error(chalk.red('Failed to write or format review output'));
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}
