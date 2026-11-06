"use strict";
const vscode = require("vscode");
const { execFile } = require("child_process");
const commands = require("./commands");

let lastShown = 0;
let log;
const trace = msg => log?.appendLine(`${new Date().toISOString()} ${msg}`);

function cfg(resource) {
  return vscode.workspace.getConfiguration("dogclap", resource ?? vscode.window.activeTextEditor?.document.uri);
}

// Returns "success", "failure", or undefined when the exit code should not trigger anything.
function outcomeFor(exitCode) {
  if (typeof exitCode !== "number") {
    return undefined;
  }
  const outcome = exitCode === 0 ? "success" : "failure";
  const triggerOn = cfg().get("triggerOn", "failure");
  return triggerOn === "both" || triggerOn === outcome ? outcome : undefined;
}

function activate(context) {
  log = vscode.window.createOutputChannel("DogClap");
  context.subscriptions.push(log);
  trace(`activated v${context.extension.packageJSON.version}, triggerOn=${cfg().get("triggerOn")}, enabledCommands=${JSON.stringify(enabledCommands())}`);
  const endListener = vscode.window.onDidEndTerminalShellExecution(event => {
    const command = event.execution.commandLine.value;
    const outcome = outcomeFor(event.exitCode);
    const enabled = commands.isCommandEnabled(command, enabledCommands(), isBuildCommand(command.toLowerCase()) || commands.isRunCommand(command));
    trace(`terminal end: command=${JSON.stringify(command)} exitCode=${event.exitCode} outcome=${outcome} enabled=${enabled}`);
    if (outcome && enabled) {
      celebrate(context, outcome);
    }
  });
  const taskListener = vscode.tasks.onDidEndTaskProcess(event => {
    const outcome = outcomeFor(event.exitCode);
    const task = event.execution.task;
    const resource = typeof task.scope === "object" ? task.scope.uri : undefined;
    if (outcome && isCelebrationTask(task, enabledCommands(resource))) {
      celebrate(context, outcome);
    }
  });
  const debugTracker = vscode.debug.registerDebugAdapterTrackerFactory("*", {
    createDebugAdapterTracker: session => ({
      onDidSendMessage: message => {
        const isExit = message?.type === "event" && message.event === "exited";
        const outcome = isExit ? outcomeFor(message.body?.exitCode) : undefined;
        if (outcome &&
          commands.isDebugSessionEnabled(session.configuration, enabledCommands(session.workspaceFolder?.uri))) {
          celebrate(context, outcome);
        }
      }
    })
  });
  const preview = vscode.commands.registerCommand("dogclap.preview", () => {
    if (!vscode.window.activeTextEditor) {
      vscode.window.showWarningMessage("DogClap: open a text file in the editor first, the dog is shown inside it.");
      return;
    }
    lastShown = 0;
    celebrate(context, "failure");
  });
  const showLog = vscode.commands.registerCommand("dogclap.showLog", () => log.show(true));
  context.subscriptions.push(showLog, endListener, taskListener, debugTracker, preview);
}

function enabledCommands(resource) {
  const configured = cfg(resource).get("enabledCommands", ["all"]);
  return Array.isArray(configured) ? configured.filter(v => typeof v === "string") : ["all"];
}

function isCelebrationTask(task, enabled) {
  const execution = task.execution;
  if (execution instanceof vscode.ProcessExecution) {
    const command = `"${execution.process}"`;
    if ((0, commands_1.isCommandEnabled)(command, enabled, isBuildCommand(execution.process.toLowerCase()) ||
      (0, commands_1.isRunCommand)(execution.process) || /\.exe$/i.test(execution.process))) {
      return true;
    }
  }
  if (execution instanceof vscode.ShellExecution) {
    const rawCommand = execution.commandLine ?? execution.command;
    const command = typeof rawCommand === 'string' ? rawCommand : rawCommand?.value;
    if (command && (0, commands_1.isCommandEnabled)(command, enabled, isBuildCommand(command.toLowerCase()) || (0, commands_1.isRunCommand)(command))) {
      return true;
    }
  }
  const isNamedTask = task.group?.id === vscode.TaskGroup.Build.id ||
    task.group?.id === vscode.TaskGroup.Test.id ||
    /\b(build|compile|run|execute|test)\b/i.test(task.name);
  return isNamedTask && enabled.some(value => ['*', 'all', 'tasks'].includes(value.trim().toLowerCase()));
}
function isBuildCommand(command) {
  const buildCommands = [
    // JavaScript / TypeScript
    /\bnpm\s+run\s+build\b/,
    /\bnpm\s+run\s+compile\b/,
    /\byarn\s+build\b/,
    /\byarn\s+compile\b/,
    /\bpnpm\s+build\b/,
    /\bpnpm\s+compile\b/,
    /\bnpx\s+tsc\b/,
    /\btsc\b/,
    // Java
    /\bmvn\s/,
    /\bmvnw\s/,
    /\bgradle\s/,
    /\bgradlew\s/,
    // .NET
    /\bdotnet\s+build\b/,
    // Rust
    /\bcargo\s+build\b/,
    // Go
    /\bgo\s+build\b/,
    // C / C++
    /\bmake\b/,
    /\bcmake\b/,
    /\bg\+\+(?=\s|$)/,
    /\bclang\+\+(?=\s|$)/,
    /\bcl(\.exe)?\b/,
    /\bcmake\s+--build\b/,
    /\bninja\b/,
    /\bmake\b/,
    // Salesforce
    /\bsf\s+project\s+deploy\b/,
    /\bsfdx\s+force:source:deploy\b/
  ];
  return buildCommands.some(pattern => pattern.test(command));
}
// On failure, prefer the failure-specific setting and fall back to the regular one.
function mediaPath(context, setting, fallback, outcome) {
  const failureSetting = "failure" + setting[0].toUpperCase() + setting.slice(1);
  const custom = (outcome === "failure" ? cfg().get(failureSetting, "").trim() : "") || cfg().get(setting, "").trim();
  return custom || vscode.Uri.joinPath(context.extensionUri, "media", fallback).fsPath;
}

function celebrate(context, outcome) {
  const now = Date.now();
  if (now - lastShown < 1500) {
    trace("celebrate skipped: debounce");
    return;
  }
  trace(`celebrate ${outcome}: editor=${!!vscode.window.activeTextEditor}`);
  lastShown = now;
  showDog(context, outcome);
  if (cfg().get("playSound", true)) {
    playSound(mediaPath(context, "soundPath", "dogclap.wav", outcome));
  }
}

function showDog(context, outcome) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return false;
  }
  const bottom = cfg().get("position", "bottom-right") === "bottom-right";
  const size = `${cfg().get("sizePx", 60)}px`;
  const duration = cfg().get("durationMs", 3200);
  const decorationType = vscode.window.createTextEditorDecorationType({
    before: {
      contentIconPath: vscode.Uri.file(mediaPath(context, "gifPath", "dogclap.gif", outcome)),
      textDecoration: `none; position: absolute; ${bottom ? `bottom: ${cfg().get("bottomOffsetPx", 40)}px; right: 24px;` : "top: 8px; left: 50%; transform: translateX(-50%);"} pointer-events: none; z-index: 10;`,
      width: size,
      height: size
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });
  // The icon is absolutely positioned inside its anchor line, so anchor to the first
  // visible line for the top, or to the last (fully visible) line for the bottom.
  const place = () => {
    const ranges = editor.visibleRanges;
    const first = ranges[0]?.start.line ?? 0;
    const last = ranges[ranges.length - 1]?.end.line ?? first;
    const line = bottom ? Math.max(first, last - 1) : first;
    const pos = new vscode.Position(line, 0);
    editor.setDecorations(decorationType, [new vscode.Range(pos, pos)]);
  };
  place();
  const scrollListener = vscode.window.onDidChangeTextEditorVisibleRanges(e => {
    if (e.textEditor === editor) {
      place();
    }
  });
  setTimeout(() => {
    scrollListener.dispose();
    decorationType.dispose();
  }, duration);
  return true;
}

function playSound(file) {
  trace(`playSound ${file}`);
  if (process.platform === "win32") {
    const escaped = file.replace(/'/g, "''");
    const script = `$p = New-Object System.Media.SoundPlayer; $p.SoundLocation = '${escaped}'; $p.Load(); $p.PlaySync();`;
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true }, err => {
      if (err) { console.error("[DogClap] Audio error:", err); }
    });
    return;
  }
  const players = process.platform === "darwin" ? ["afplay"] : ["paplay", "aplay"];
  const tryPlayer = i => {
    if (i >= players.length) {
      console.error("[DogClap] No supported audio player found. Install paplay or aplay.");
      return;
    }
    execFile(players[i], [file], err => {
      if (err) {
        trace(`${players[i]} failed: ${err.message}`);
        tryPlayer(i + 1);
      }
    });
  };
  tryPlayer(0);
}

function deactivate() { }

module.exports = { activate, deactivate };
