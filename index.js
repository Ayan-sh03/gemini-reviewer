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
    if (options.commit) {
      diff = await git.diff([options.commit]);
    } else if (options.branch) {
      diff = await git.diff([`origin/${options.branch}`]);
    } else {
      // Default to last commit
      diff = await git.diff(['HEAD^', 'HEAD']);
    }
    return diff;
  } catch (error) {
    console.error('Error getting git diff:', error);
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
    // Get the diff based on provided options
    const diff = await getDiff(options);

    if (!diff) {
      console.log('No changes found.');
      return;
    }

    console.log('Analyzing diff with AI...\n');

    // Get AI review
    const review = await getAIReview(diff);

    // Output the review
    console.log('AI Review:\n');
    console.log(review);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();