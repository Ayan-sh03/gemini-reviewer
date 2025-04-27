import { type GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ProgramOptions } from './review-cache.js';
import { generateCacheKey, getCachedReview, cacheReview } from './review-cache.js';

// Load environment variables before initializing the AI client
dotenv.config();

// Initialize the Google AI client
const genAi = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? '');
const model: GenerativeModel = genAi.getGenerativeModel({
  model: process.env.MODEL_ID ?? 'gemini-2.5-flash-preview-04-17',
});

/**
 * Format and style the review sections
 */
async function formatReviewSection(text: string): Promise<string> {
  const sections = text.split('\n\n');
  let formatted = '';

  for (const section of sections) {
    if (section.trim()) {
      formatted += `\n${chalk.blue(section.trim())}\n`;
    }
  }

  return formatted;
}

/**
 * Load a prompt template and substitute variables
 */
async function loadTemplate(templateName: string = 'default'): Promise<string> {
  const defaultPath = path.join('prompts', 'default.txt');
  let defaultTemplate: string;

  try {
    // Always load the default template first
    defaultTemplate = await fs.promises.readFile(defaultPath, 'utf-8');
  } catch (err) {
    console.error(chalk.red(`FATAL: Failed to load critical default template '${defaultPath}': ${err instanceof Error ? err.message : err}`));
    throw err; // Cannot proceed if default template is missing/unreadable
  }

  if (templateName === 'default') {
    return defaultTemplate;
  }

  try {
    const templatePath = path.join('prompts', `${templateName}.txt`);
    return await fs.promises.readFile(templatePath, 'utf-8');
  } catch (err) {
    // Requested template not found or read error, fall back to default
    console.error(`Failed to load template '${templateName}': ${err instanceof Error ? err.message : err}. Using default template.`);
    return defaultTemplate;
  }
}

/**
 * Get an AI review of the provided diff
 */
export async function getAiReview(diff: string, options: ProgramOptions): Promise<string> {
  try {
    // Check cache first
    const cacheKey = generateCacheKey(diff, options);
    const cachedReview = await getCachedReview(cacheKey, options);

    if (cachedReview) {
      console.log(chalk.cyan('\nUsing cached review result'));
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
    await cacheReview(cacheKey, review, options);

    return review;
  } catch (error) {
    const err = error as Error;
    console.error(chalk.red('Error getting AI review:'), err);
    process.exit(1);
  }
}
