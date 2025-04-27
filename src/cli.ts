import { program } from 'commander';
import type { ProgramOptions } from './review-cache.js';

/**
 * Parse command line arguments and return options
 */
export function parseCommandLineArgs(): ProgramOptions {
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

  // Get parsed options
  const options = program.opts<ProgramOptions>();

  // Show help if no options provided
  if (!options.commit && !options.branch && !options.last && !options.output) {
    program.help();
  }

  // Set default option to --last if no other options are provided
  if (!options.commit && !options.branch && !options.last) {
    options.last = true;
  }

  return options;
}
