"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRunCommand = isRunCommand;
exports.commandSelectors = commandSelectors;
exports.isCommandEnabled = isCommandEnabled;
exports.isDebugSessionEnabled = isDebugSessionEnabled;
exports.isSuccessfulDebugExit = isSuccessfulDebugExit;
/** Commands that run a program rather than merely navigate or inspect the shell. */
function isRunCommand(command) {
  const invocation = command.trim().replace(/^&\s+/, '');
  // Direct executable paths, including PowerShell's & "..." syntax.
  if (/^(?:"[^"]+\.exe"|'[^']+\.exe'|[^\s"'|;&<>]+\.exe)(?=\s|$)/i.test(invocation)) {
    return true;
  }
  if (/^(?:\.\/|\.\\|~\/|\/)[^\s|;&<>]+/.test(invocation)) {
    return true;
  }
  // Interpreters, script runners and common run commands.
  return /^(?:python(?:\d+(?:\.\d+)?)?|py|node|bun|deno|tsx|ts-node|ruby|php|perl|java|kotlin|swift|lua|rscript|bash|sh|zsh)(?:\.exe)?(?=\s|$)/i.test(invocation)
    || /^(?:dotnet|cargo|go)\s+run\b/i.test(invocation)
    || /^(?:npm|pnpm|yarn)\s+(?:run\s+\S+|start\b|test\b|exec\b)/i.test(invocation)
    || /^npx\s+\S+/i.test(invocation);
}
/** Names users can put in the enabledCommands setting for a shell command. */
function commandSelectors(command) {
  const match = /^\s*(?:&\s*)?(?:"([^"]+)"|'([^']+)'|([^\s|;&<>]+))/.exec(command);
  if (!match) {
    return [];
  }
  const token = (match[1] ?? match[2] ?? match[3]).toLowerCase();
  const name = token.split(/[\\/]/).pop() ?? token;
  const stem = name.replace(/\.(?:exe|cmd|bat)$/i, '');
  const selectors = new Set([name, stem]);
  if (/^(?:python(?:\d+(?:\.\d+)?)?|py)$/.test(stem) || name.endsWith('.py')) {
    selectors.add('python');
    selectors.add('py');
  }
  if (stem === 'npx') {
    selectors.add('npm');
  }
  if (/^(?:node|tsx|ts-node|bun|deno)$/.test(stem) || name.endsWith('.js')) {
    selectors.add('node');
  }
  if (/^(?:\.\/|\.\\|~\/|\/|[a-z]:[\\/])/i.test(token) || name.endsWith('.exe')) {
    selectors.add('executable');
  }
  return [...selectors];
}
/** '*' keeps the built-in supported-command detection; named entries opt in explicitly. */
function isCommandEnabled(command, enabled, supported) {
  const choices = enabled.map(value => value.trim().toLowerCase());
  return choices.includes('all') ||
    (choices.includes('*') && supported) ||
    commandSelectors(command).some(selector => choices.includes(selector));
}
function isDebugSessionEnabled(configuration, enabled) {
  const choices = enabled.map(value => value.trim().toLowerCase());
  if (choices.includes('*') || choices.includes('all') || choices.includes('debug')) {
    return true;
  }
  const selectors = new Set();
  if (typeof configuration.runtimeExecutable === 'string') {
    commandSelectors(configuration.runtimeExecutable).forEach(value => selectors.add(value));
  }
  if (typeof configuration.program === 'string') {
    commandSelectors(configuration.program).forEach(value => selectors.add(value));
  }
  if (typeof configuration.type === 'string') {
    const type = configuration.type.toLowerCase();
    const family = /python|debugpy/.test(type) ? 'python'
      : /node/.test(type) ? 'node'
        : /cpp|lldb|gdb/.test(type) ? 'executable'
          : /coreclr|dotnet/.test(type) ? 'dotnet'
            : type;
    selectors.add(family);
  }
  return [...selectors].some(selector => choices.includes(selector));
}
/** The Debug Adapter Protocol reports a successful program exit with this event. */
function isSuccessfulDebugExit(message) {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const event = message;
  return event.type === 'event' && event.event === 'exited' && event.body?.exitCode === 0;
}
