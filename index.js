import { program } from 'commander';
import simpleGit from 'simple-git';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

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
  code: chalk.blue.dim
};

const git = simpleGit();

// Initialize the Google AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });

// Setup CLI options
program
  .version('1.0.0')
  .option('-c, --commit <hash>', 'Compare with specific commit')
  .option('-b, --branch <name>', 'Compare with branch')
  .option('-l, --last', 'Compare with last commit (default)')
  .parse(process.argv);

const options = program.opts();

async function getDiff(options) {
  try {
    let diff;
    const hasCommits = await git.raw(['rev-list', 'HEAD', '--count']);
    const commitCount = parseInt(hasCommits.trim());

    if (commitCount === 0) {
      console.log('No commits found in the repository.');
      return '';
    }

    if (options.commit) {
      // For specific commit
      try {
        diff = await git.diff([options.commit]);
      } catch (err) {
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
        console.error(`Error accessing branch: ${err.message}`);
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
    console.error('Error getting git diff:', error.message);
    process.exit(1);
  }
}

// Format and style the review sections
async function formatReviewSection(text) {
  const sections = text.split('\n\n');
  let formatted = '';

  sections.forEach(section => {
    if (section.trim()) {
      formatted += `\n${styles.section(section.trim())}\n`;
    }
  });

  return formatted;
}

async function getAIReview(diff) {
  try {
    const prompt = `You are a ruthless code destroyer, channeling Linus Torvalds at his angriest. Annihilate the following git diff. Rip apart every line for logic flaws, performance stupidity, unreadable mess, or brain-dead design. No error is too minor—crappy naming, inconsistent formatting, or wasteful loops, obliterate them. Ignore security unless it’s a complete disaster. For every flaw, deliver exact, no-nonsense fixes. If it’s not flawless code, burn it down and explain why it’s garbage.\n\n${diff}`

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return await formatReviewSection(response.text());
  } catch (error) {
    console.error('Error getting AI review:', error);
    process.exit(1);
  }
}

async function main() {
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
      const review = await getAIReview(diff);
      spinner.succeed(styles.success('AI review completed'));

      // Output header and review
      console.log(styles.header('\nCODE REVIEW RESULTS\n'));
      console.log(styles.info('='.repeat(50)));
      console.log(review);
      console.log(styles.info('='.repeat(50)));
      console.log(styles.success('\nReview completed successfully!\n'));

    } catch (aiError) {
      spinner.fail(styles.error('AI Review Failed'));
      console.error(styles.error('Error getting AI review:'), aiError.message);
      console.error(styles.warning('The diff was retrieved successfully, but the AI review failed.'));
      process.exit(1);
    }

  } catch (error) {
    console.error(styles.error('Error:'), error.message || error);
    process.exit(1);
  }
}

main();