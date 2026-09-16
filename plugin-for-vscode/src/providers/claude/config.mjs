import path from "node:path";
import { AUTH_DIR } from "../../config.mjs";

export const CLAUDE_BASE_URL = "https://claude.ai";
export const CLAUDE_AUTH_FILE = path.join(AUTH_DIR, "claude-state.json");
export const CLAUDE_BROWSER_PROFILE = path.join(AUTH_DIR, "browser-profile_claude");
export const CLAUDE_DEFAULT_MODEL = "claude-3-7-sonnet";
