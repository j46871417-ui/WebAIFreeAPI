#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { spawn } from "node:child_process";

const APP_DIR = "C:\\ai-free";
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
  console.log(`${C.cyan}${C.bold}              AI Free - Главное Меню                  ${C.reset}`);
  console.log(`${C.cyan}${C.bold}======================================================${C.reset}`);
  console.log(`\n${C.bold}Основные действия:${C.reset}`);
  console.log(`  ${C.green}1${C.reset} - Запустить веб-интерфейс AI Free (окно в браузере)`);
  console.log(`  ${C.green}2${C.reset} - Запустить фоновый сервер API (для OpenCode / Cursor)`);
  console.log(`\n${C.bold}Авторизация аккаунтов (откроется окно браузера):${C.reset}`);
  console.log(`  ${C.yellow}3${C.reset} - Войти в DeepSeek (chat.deepseek.com)`);
  console.log(`  ${C.yellow}4${C.reset} - Войти в Qwen (chat.qwen.ai)`);
  console.log(`  ${C.yellow}5${C.reset} - Войти в ChatGPT (chatgpt.com)`);
  console.log(`\n${C.bold}Интеграция и утилиты:${C.reset}`);
  console.log(`  ${C.magenta}6${C.reset} - Настроить конфигурацию для OpenCode Desktop`);
  console.log(`  ${C.magenta}7${C.reset} - Создать / обновить ярлыки на Рабочем столе`);
  console.log(`  ${C.magenta}8${C.reset} - Проверить статус сессий и токенов`);
  console.log(`\n  ${C.dim}0 - Выход${C.reset}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`${C.bold}Выберите пункт (0-8): ${C.reset}`, (answer) => {
    rl.close();
    handleChoice(answer.trim());
  });
}

function handleChoice(choice) {
  switch (choice) {
    case "1":
      runCommand(["--window"]);
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
      console.log(`\n${C.green}До встречи!${C.reset}\n`);
      process.exit(0);
      break;
    default:
      console.log(`\n${C.red}Неверный выбор. Повторите ввод.${C.reset}`);
      setTimeout(showMenu, 1200);
      break;
  }
}

function runScript(relScript) {
  const scriptPath = path.join(APP_DIR, relScript);
  console.log(`\n${C.cyan}▶ Выполнение: ${relScript}...${C.reset}\n`);
  const nodePath = fs.existsSync(NODE_EXE) ? NODE_EXE : process.execPath;
  const child = spawn(nodePath, [scriptPath], { cwd: APP_DIR, stdio: "inherit" });
  child.on("exit", () => {
    promptReturn();
  });
}

function runCommand(args) {
  console.log(`\n${C.cyan}▶ Запуск: node bin/deepseek.mjs ${args.join(" ")}${C.reset}\n`);
  const nodePath = fs.existsSync(NODE_EXE) ? NODE_EXE : process.execPath;
  const child = spawn(nodePath, [ENTRY_FILE, ...args], { cwd: APP_DIR, stdio: "inherit" });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.log(`\n${C.yellow}⚠ Процесс завершился с кодом: ${code}${C.reset}`);
    } else {
      console.log(`\n${C.green}✔ Завершено успешно.${C.reset}`);
    }
    promptReturn();
  });
}

function promptReturn() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("\nНажмите Enter, чтобы вернуться в главное меню...", () => {
    rl.close();
    showMenu();
  });
}
