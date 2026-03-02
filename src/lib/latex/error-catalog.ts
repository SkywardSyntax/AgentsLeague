/**
 * LaTeX error catalog — comprehensive error code map with user-friendly
 * messages and recovery suggestions for LaTeX rendering failures.
 */

export enum LatexErrorCode {
  UNKNOWN = 2000,
  MISSING_BRACE = 2001,
  UNDEFINED_COMMAND = 2002,
  DOUBLE_SUPERSCRIPT = 2003,
  DOUBLE_SUBSCRIPT = 2004,
  MISMATCHED_ENV = 2005,
  INVALID_DELIMITER = 2006,
  MISSING_ARGUMENT = 2007,
  EXTRA_ALIGNMENT = 2008,
  MATH_MODE_ERROR = 2009,
}

export interface LatexErrorInfo {
  code: LatexErrorCode;
  message: string;
  suggestion: string;
  recoverable: boolean;
}

const ERROR_CATALOG: Record<LatexErrorCode, Omit<LatexErrorInfo, 'code'>> = {
  [LatexErrorCode.UNKNOWN]: {
    message: 'An unknown LaTeX rendering error occurred',
    suggestion: 'Check the expression for syntax issues',
    recoverable: false,
  },
  [LatexErrorCode.MISSING_BRACE]: {
    message: 'Missing closing brace in expression',
    suggestion: 'Add the missing } to balance braces',
    recoverable: true,
  },
  [LatexErrorCode.UNDEFINED_COMMAND]: {
    message: 'Undefined control sequence',
    suggestion: 'Check the command name for typos or use a supported command',
    recoverable: true,
  },
  [LatexErrorCode.DOUBLE_SUPERSCRIPT]: {
    message: 'Double superscript detected',
    suggestion: 'Use braces to group: a^{b^c} instead of a^b^c',
    recoverable: true,
  },
  [LatexErrorCode.DOUBLE_SUBSCRIPT]: {
    message: 'Double subscript detected',
    suggestion: 'Use braces to group: a_{b_c} instead of a_b_c',
    recoverable: true,
  },
  [LatexErrorCode.MISMATCHED_ENV]: {
    message: 'Mismatched \\begin and \\end environments',
    suggestion: 'Ensure every \\begin{env} has a matching \\end{env}',
    recoverable: false,
  },
  [LatexErrorCode.INVALID_DELIMITER]: {
    message: 'Invalid or mismatched delimiter',
    suggestion: 'Use matching delimiters: \\left( ... \\right)',
    recoverable: true,
  },
  [LatexErrorCode.MISSING_ARGUMENT]: {
    message: 'Missing required argument for command',
    suggestion: 'Provide the required argument in braces: \\cmd{arg}',
    recoverable: true,
  },
  [LatexErrorCode.EXTRA_ALIGNMENT]: {
    message: 'Extra alignment tab character &',
    suggestion: 'Remove extra & or add more columns to the environment',
    recoverable: true,
  },
  [LatexErrorCode.MATH_MODE_ERROR]: {
    message: 'Expression requires math mode',
    suggestion: 'Wrap the expression in $ ... $ or \\( ... \\)',
    recoverable: true,
  },
};

const ERROR_PATTERNS: Array<{ pattern: RegExp; code: LatexErrorCode }> = [
  { pattern: /missing\s*[})\]]/i, code: LatexErrorCode.MISSING_BRACE },
  { pattern: /undefined\s*(control\s*sequence|command)/i, code: LatexErrorCode.UNDEFINED_COMMAND },
  { pattern: /double\s*superscript/i, code: LatexErrorCode.DOUBLE_SUPERSCRIPT },
  { pattern: /double\s*subscript/i, code: LatexErrorCode.DOUBLE_SUBSCRIPT },
  { pattern: /mismatched|\\begin.*\\end/i, code: LatexErrorCode.MISMATCHED_ENV },
  { pattern: /invalid\s*delimiter/i, code: LatexErrorCode.INVALID_DELIMITER },
  { pattern: /missing\s*argument/i, code: LatexErrorCode.MISSING_ARGUMENT },
  { pattern: /extra\s*alignment/i, code: LatexErrorCode.EXTRA_ALIGNMENT },
  { pattern: /math\s*mode/i, code: LatexErrorCode.MATH_MODE_ERROR },
];

export function matchErrorPattern(errorText: string): LatexErrorCode {
  for (const entry of ERROR_PATTERNS) {
    if (entry.pattern.test(errorText)) return entry.code;
  }
  return LatexErrorCode.UNKNOWN;
}

export function getLatexError(errorText: string): LatexErrorInfo {
  const code = matchErrorPattern(errorText);
  return { code, ...ERROR_CATALOG[code] };
}

export function isRecoverable(code: LatexErrorCode): boolean {
  return ERROR_CATALOG[code].recoverable;
}
