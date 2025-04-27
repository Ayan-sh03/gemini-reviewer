import { describe, it, expect, vi, beforeEach, afterAll, type Mock } from 'vitest';
import type { SimpleGit } from 'simple-git';
import type { GenerativeModel, GenerateContentResult } from '@google/generative-ai';

// Setup all mocks before imports
vi.mock('simple-git');
vi.mock('@google/generative-ai');
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn()
  },
  config: vi.fn()
}));
vi.mock('ora', () => ({
  default: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  })),
}));

// Import after mocks are set up
import { simpleGit } from 'simple-git';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDiff, formatReviewSection, getAIReview } from './index.js';

describe('Git Diff Reviewer', () => {
  const mockGit = {
    raw: vi.fn(),
    diff: vi.fn(),
    branch: vi.fn(),
  } as unknown as Mocked<SimpleGit>; // Use Mocked utility for better typing

  const mockModel = {
    generateContent: vi.fn(),
  } as unknown as Mocked<GenerativeModel>;

  const mockGenAI = {
    getGenerativeModel: vi.fn().mockReturnValue(mockModel),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup git mock
    vi.mocked(simpleGit).mockReturnValue(mockGit);
    mockGit.branch.mockResolvedValue({ all: ['remotes/origin/main'] });

    // Setup AI mock
    vi.mocked(GoogleGenerativeAI).mockImplementation(() => mockGenAI as any);
    mockModel.generateContent.mockResolvedValue({
      response: {
        text: () => 'AI Review Content'
      }
    } as unknown as GenerateContentResult);

    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  describe('formatReviewSection', () => {
    it('should format text with sections correctly', async () => {
      const inputText = 'Section 1\n\nSection 2 is longer\n\nSection 3.';
      const result = await formatReviewSection(inputText);
      expect(result).toContain('Section 1');
      expect(result).toContain('Section 2 is longer');
      expect(result).toContain('Section 3.');
      expect(result.split('\n').filter(line => line.trim() !== '').length).toBeGreaterThanOrEqual(3);
    });

    it('should handle empty input', async () => {
      const result = await formatReviewSection('');
      expect(result).toBe('');
    });
  });

  describe('getDiff', () => {
    beforeEach(() => {
      mockGit.raw.mockResolvedValue('2'); // Default to 2 commits
    });

    it('should get diff for the last commit', async () => {
      mockGit.diff.mockResolvedValue('diff for last commit');
      const result = await getDiff({ last: true });
      expect(result).toBe('diff for last commit');
      expect(mockGit.diff).toHaveBeenCalledWith(['HEAD^', 'HEAD']);
    });

    it('should handle first commit differently', async () => {
      mockGit.raw.mockResolvedValue('1');
      mockGit.diff.mockResolvedValue('diff for first commit');
      const result = await getDiff({ last: true });
      const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
      expect(mockGit.diff).toHaveBeenCalledWith([emptyTree, 'HEAD']);
      expect(result).toBe('diff for first commit');
    });

    it('should handle no commits case', async () => {
      mockGit.raw.mockResolvedValue('0');
      const result = await getDiff({ last: true });
      expect(result).toBe('');
    });

    it('should get diff for specific commit', async () => {
      const commitHash = 'abcdef123';
      mockGit.diff.mockResolvedValue('diff for specific commit');
      const result = await getDiff({ commit: commitHash });
      expect(mockGit.diff).toHaveBeenCalledWith([commitHash]);
      expect(result).toBe('diff for specific commit');
    });

    it('should get diff for specific branch', async () => {
      const branchName = 'main';
      mockGit.diff.mockResolvedValue('diff for branch');
      const result = await getDiff({ branch: branchName });
      expect(mockGit.branch).toHaveBeenCalled();
      expect(mockGit.diff).toHaveBeenCalledWith([`origin/${branchName}`]);
      expect(result).toBe('diff for branch');
    });

    it('should throw error for invalid commit', async () => {
      const commitHash = 'invalid';
      mockGit.diff.mockRejectedValue(new Error('invalid commit'));
      await expect(getDiff({ commit: commitHash })).rejects.toThrow(/Error getting git diff: Invalid commit/);
    });

    it('should throw error for non-existent branch', async () => {
      mockGit.branch.mockResolvedValue({ all: [] });
      await expect(getDiff({ branch: 'nonexistent' })).rejects.toThrow(/Error getting git diff: Branch.*not found/);
    });
  });

  describe('getAIReview', () => {
    it('should generate review from diff', async () => {
      const diffInput = 'test diff content';
      const result = await getAIReview(diffInput);
      expect(mockModel.generateContent).toHaveBeenCalled();
      const prompt = mockModel.generateContent.mock.calls[0][0];
      expect(prompt).toContain(diffInput);
      expect(result).toContain('AI Review Content');
    });

    it('should throw error when AI fails', async () => {
      mockModel.generateContent.mockRejectedValue(new Error('AI API failed'));
      await expect(getAIReview('test diff')).rejects.toThrow(/Error getting AI review: Error: AI API failed/);
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });
});

// Helper type for better mocking
type Mocked<T> = {
  [P in keyof T]: T[P] extends (...args: any[]) => any ? Mock : T[P];
};