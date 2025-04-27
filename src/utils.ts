/**
 * Utility functions used across the project
 */

/**
 * Remove ANSI color codes from a string
 * Using a simpler regex that matches ANSI escape sequences without control characters
 * @param str String containing ANSI codes
 * @returns String with ANSI codes removed
 */
export function stripAnsiCodes(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require matching control characters \u001b (ESC) and \u009b (CSI)
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}
