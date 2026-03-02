/**
 * LaTeX command allowlist — strict allowlist of safe LaTeX commands.
 * Blocks dangerous commands that could access the filesystem, execute
 * arbitrary code, or modify TeX internals.
 */

const SAFE_COMMANDS = new Set([
  // Basic math
  'frac', 'sqrt', 'sum', 'prod', 'int', 'lim', 'infty', 'partial',
  'nabla', 'pm', 'mp', 'times', 'div', 'cdot', 'circ', 'ast',
  // Greek letters
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho',
  'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
  'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Pi', 'Rho',
  'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega',
  'varepsilon', 'vartheta', 'varpi', 'varrho', 'varsigma', 'varphi',
  // Relations
  'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'simeq', 'cong',
  'propto', 'subset', 'supset', 'subseteq', 'supseteq', 'in', 'notin',
  'ni', 'forall', 'exists', 'nexists',
  // Arrows
  'leftarrow', 'rightarrow', 'leftrightarrow', 'Leftarrow', 'Rightarrow',
  'Leftrightarrow', 'uparrow', 'downarrow', 'mapsto', 'to',
  // Formatting
  'text', 'textbf', 'textit', 'textrm', 'mathrm', 'mathbf', 'mathit',
  'mathcal', 'mathbb', 'mathfrak', 'mathsf', 'mathtt',
  'hat', 'bar', 'dot', 'ddot', 'tilde', 'vec', 'overline', 'underline',
  'overbrace', 'underbrace', 'widehat', 'widetilde',
  // Delimiters
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'langle', 'rangle',
  'lfloor', 'rfloor', 'lceil', 'rceil', 'lvert', 'rvert',
  // Environments
  'begin', 'end',
  // Layout
  'quad', 'qquad', 'hspace', 'vspace', 'hfill', 'vfill',
  'displaystyle', 'textstyle', 'scriptstyle', 'scriptscriptstyle',
  // Operators
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'det', 'dim', 'ker',
  'min', 'max', 'sup', 'inf', 'gcd', 'deg', 'hom', 'arg',
  'operatorname',
  // Matrices
  'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix',
  // Misc
  'color', 'boxed', 'cancel', 'bcancel', 'xcancel',
  'stackrel', 'overset', 'underset', 'xleftarrow', 'xrightarrow',
  'not', 'neg', 'land', 'lor', 'oplus', 'otimes', 'cup', 'cap',
  'emptyset', 'varnothing', 'setminus', 'ldots', 'cdots', 'vdots', 'ddots',
  'space', 'newline',
]);

const DANGEROUS_COMMANDS = new Set([
  'input', 'include', 'write', 'read', 'openin', 'openout', 'closein', 'closeout',
  'catcode', 'def', 'edef', 'gdef', 'xdef', 'let', 'futurelet',
  'csname', 'endcsname', 'expandafter', 'noexpand',
  'immediate', 'special', 'shipout',
  'jobname', 'meaning', 'show', 'showthe',
  'newcommand', 'renewcommand', 'providecommand',
  'usepackage', 'RequirePackage', 'documentclass',
  'verbatiminput', 'lstinputlisting',
  'url', 'href',
  'luaexec', 'directlua', 'latelua',
  'shellescape', 'write18',
]);

const MAX_NESTING_DEPTH = 20;
const MAX_COMMAND_LENGTH = 50;
const COMMAND_RE = /\\([a-zA-Z]+)/g;

export interface CommandCheckResult {
  safe: boolean;
  blocked: string[];
  unknown: string[];
}

export function isCommandAllowed(command: string): boolean {
  return SAFE_COMMANDS.has(command);
}

export function isCommandDangerous(command: string): boolean {
  return DANGEROUS_COMMANDS.has(command);
}

export function validateLatexCommands(tex: string): CommandCheckResult {
  const blocked: string[] = [];
  const unknown: string[] = [];

  if (typeof tex !== 'string') {
    return { safe: true, blocked: [], unknown: [] };
  }

  let match: RegExpExecArray | null;
  const seen = new Set<string>();

  const re = new RegExp(COMMAND_RE.source, 'g');
  while ((match = re.exec(tex)) !== null) {
    const cmd = match[1]!;
    if (seen.has(cmd)) continue;
    seen.add(cmd);

    if (cmd.length > MAX_COMMAND_LENGTH) {
      blocked.push(cmd);
    } else if (DANGEROUS_COMMANDS.has(cmd)) {
      blocked.push(cmd);
    } else if (!SAFE_COMMANDS.has(cmd)) {
      unknown.push(cmd);
    }
  }

  return {
    safe: blocked.length === 0,
    blocked,
    unknown,
  };
}

export function checkNestingDepth(tex: string): { safe: boolean; depth: number } {
  let depth = 0;
  let maxDepth = 0;

  for (const ch of tex) {
    if (ch === '{') {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    }
  }

  return { safe: maxDepth <= MAX_NESTING_DEPTH, depth: maxDepth };
}

export function sanitizeLatex(tex: string): string {
  if (typeof tex !== 'string') return '';

  const result = validateLatexCommands(tex);
  let sanitized = tex;

  for (const cmd of result.blocked) {
    const cmdRe = new RegExp(`\\\\${cmd}\\b`, 'g');
    sanitized = sanitized.replace(cmdRe, `\\text{[blocked: ${cmd}]}`);
  }

  return sanitized;
}
