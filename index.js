import { program } from 'commander';
import simpleGit from 'simple-git';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

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

async function getAIReview(diff) {
  try {
    const prompt = `You are a thorough code reviewer. Please review the following git diff and provide detailed feedback on code quality, potential issues, and suggestions for improvement:\n\n${diff}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error getting AI review:', error);
    process.exit(1);
  }
}

async function main() {
  try {
    // Show help if no options provided
    if (!options.commit && !options.branch && !options.last) {
      program.help();
      return;
    }

    // Get the diff based on provided options
    const diff = await getDiff(options);

    if (!diff) {
      console.log('No changes found to review.');
      process.exit(0);
    }

    console.log('Getting code review from AI...\n');

    try {
      // Get AI review
      const review = await getAIReview(diff);

      // Output the review
      console.log('Code Review Results:\n');
      console.log(review);
      console.log('\nReview completed successfully.');
    } catch (aiError) {
      console.error('Error getting AI review:', aiError.message);
      console.error('The diff was retrieved successfully, but the AI review failed.');
      process.exit(1);
    }

  } catch (error) {
    console.error('Error:', error.message || error);
    process.exit(1);
  }
}

main();