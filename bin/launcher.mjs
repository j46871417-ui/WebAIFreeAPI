#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const APP_DIR = process.env.AI_FREE_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY_FILE = path.join(APP_DIR, "bin", "deepseek.mjs");
const NODE_EXE = path.join(APP_DIR, "node", "node.exe");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

const cliArgs = process.argv.slice(2);
if (cliArgs.length > 0) {
  runCommand(cliArgs);
} else {
  showMenu();
}

function showMenu() {
  console.clear();
  console.log(`${C.cyan}${C.bold}======================================================${C.reset}`);
  console.log(`${C.cyan}${C.bold}              WebAIFreeAPI - Main Menu                ${C.reset}`);
  console.log(`${C.cyan}${C.bold}======================================================${C.reset}`);
  console.log(`\n${C.bold}Core Actions:${C.reset}`);
  console.log(`  ${C.green}1${C.reset} - Start WebAIFreeAPI (Window & Background Server)`);
  console.log(`  ${C.green}2${C.reset} - Start Headless API Server (127.0.0.1:4317 / OpenAI)`);
  console.log(`\n${C.bold}Provider Authentication (Browser Window):${C.reset}`);
  console.log(`  ${C.yellow}3${C.reset} - Login to DeepSeek (chat.deepseek.com)`);
  console.log(`  ${C.yellow}4${C.reset} - Login to Qwen (chat.qwen.ai)`);
  console.log(`  ${C.yellow}5${C.reset} - Login to ChatGPT (chatgpt.com)`);
  console.log(`\n${C.bold}Integration & Utilities:${C.reset}`);
  console.log(`  ${C.magenta}6${C.reset} - Configure OpenCode Desktop integration`);
  console.log(`  ${C.magenta}7${C.reset} - Create / Refresh Desktop shortcuts`);
  console.log(`  ${C.magenta}8${C.reset} - Check sessions and API status`);
  console.log(`\n  ${C.dim}0 - Exit${C.reset}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`${C.bold}Choose an option (0-8): ${C.reset}`, (answer) => {
    rl.close();
    handleChoice(answer.trim());
  });
}

function handleChoice(choice) {
  switch (choice) {
    case "1":
      startApp();
      break;
    case "2":
      runCommand(["--no-window"]);
      break;
    case "3":
      runCommand(["--login"]);
      break;
    case "4":
      runCommand(["--login-qwen"]);
      break;
    case "5":
      runCommand(["--login-chatgpt"]);
      break;
    case "6":
      runScript("scripts/setup-opencode.mjs");
      break;
    case "7":
      runScript("scripts/create-shortcuts.mjs");
      break;
    case "8":
      runCommand(["--check"]);
      break;
    case "0":
    case "exit":
    case "q":
      console.log(`\n${C.green}Bye!${C.reset}\n`);
      process.exit(0);
      break;
    default:
      console.log(`\n${C.red}Invalid choice. Please try again.${C.reset}`);
      setTimeout(showMenu, 1200);
      break;
  }
}

function startApp() {
  const vbsPath = path.join(APP_DIR, "run-silent.vbs");
  console.log(`\n${C.cyan}[*] Launching WebAIFreeAPI background service and app window...${C.reset}\n`);
  const child = spawn("wscript.exe", [vbsPath], { cwd: APP_DIR, detached: true, stdio: "ignore" });
  child.unref();
  console.log(`${C.green}[OK] WebAIFreeAPI launched successfully!${C.reset}`);
  console.log(`     - Web Interface: http://127.0.0.1:4317`);
  console.log(`     - System Tray  : Icon active near Windows clock\n`);
  promptReturn();
}

function runScript(relScript) {
  const scriptPath = path.join(APP_DIR, relScript);
  console.log(`\n${C.cyan}[*] Running: ${relScript}...${C.reset}\n`);
  const nodePath = fs.existsSync(NODE_EXE) ? NODE_EXE : process.execPath;
  const child = spawn(nodePath, [scriptPath], { cwd: APP_DIR, stdio: "inherit" });
  child.on("exit", () => {
    promptReturn();
  });
}

function runCommand(args) {
  console.log(`\n${C.cyan}[*] Running: node bin/deepseek.mjs ${args.join(" ")}${C.reset}\n`);
  const nodePath = fs.existsSync(NODE_EXE) ? NODE_EXE : process.execPath;
  const child = spawn(nodePath, [ENTRY_FILE, ...args], { cwd: APP_DIR, stdio: "inherit" });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.log(`\n${C.yellow}[!] Process exited with code: ${code}${C.reset}`);
    } else {
      console.log(`\n${C.green}[OK] Completed successfully.${C.reset}`);
    }
    promptReturn();
  });
}

function promptReturn() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("\nPress Enter to return to main menu...", () => {
    rl.close();
    showMenu();
  });
}
