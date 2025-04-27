# Git Diff Reviewer

A CLI tool that uses Gemini AI to perform intelligent code reviews of git diffs. Built with TypeScript.

## Features

- Review diffs between commits
- Compare with specific branches
- AI-powered code analysis focusing on:
  - Logic errors and edge cases
  - Performance bottlenecks
  - Design flaws
  - Code style and maintainability

## Prerequisites

- Node.js >= 18
- Git installed
- Google API key for Gemini AI

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Create a `.env` file with your Gemini API key:
```
GOOGLE_API_KEY=your_api_key_here
```

## Usage

```bash
# Compare with last commit
npm start -- -l

# Compare with specific commit
npm start -- -c <commit-hash>

# Compare with branch
npm start -- -b <branch-name>
```

## Development

- `npm run build` - Compile TypeScript
- `npm start` - Build and run the application