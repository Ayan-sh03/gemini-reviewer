import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

// Cache configuration
const CACHE_DIR = '.gitreview-cache';
const CACHE_VERSION = '1'; // Increment this when prompt format changes

export interface ProgramOptions {
  commit?: string;
  branch?: string;
  last?: boolean;
  output?: string;
  exclude?: string[];
  focus?: string[];
  ignore?: string[];
  template?: string;
}

export interface CacheEntry {
  version: string;
  modelId: string;
  template: string;
  focus?: string[];
  ignore?: string[];
  review: string;
}

// Ensure cache directory exists on module initialization
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

/**
 * Generate a unique hash for the diff and review configuration
 */
export function generateCacheKey(diff: string, options: ProgramOptions): string {
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

/**
 * Try to get a cached review result
 */
export async function getCachedReview(cacheKey: string, options: ProgramOptions): Promise<string | null> {
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
    console.error(chalk.yellow('Cache read error:'), (err as Error).message);
    return null;
  }
}

/**
 * Save a review result to cache
 */
export async function cacheReview(cacheKey: string, review: string, options: ProgramOptions): Promise<void> {
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
    console.error(chalk.yellow('Cache write error:'), (err as Error).message);
  }
}
