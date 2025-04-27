import chalk from 'chalk';
import { type SimpleGit, simpleGit } from 'simple-git';
import type { ProgramOptions } from './review-cache.js';

const git: SimpleGit = simpleGit();

/**
 * Get the git diff based on provided options
 */
export async function getDiff(options: ProgramOptions): Promise<string> {
  try {
    let diff: string;
    const hasCommits = await git.raw(['rev-list', 'HEAD', '--count']);
    const commitCount = Number.parseInt(hasCommits.trim());

    if (commitCount === 0) {
      console.log('No commits found in the repository.');
      return '';
    }

    // Prepare exclude patterns
    const excludeArgs = options.exclude?.flatMap((pattern) => [':(exclude)', pattern]) ?? [];

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
    console.error(chalk.red('Error getting git diff:'), err.message);
    process.exit(1);
  }
}
