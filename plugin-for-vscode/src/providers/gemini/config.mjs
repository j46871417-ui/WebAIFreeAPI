import path from "node:path";
import { AUTH_DIR } from "../../config.mjs";

export const GEMINI_BASE_URL = "https://gemini.google.com/app";
export const GEMINI_AUTH_FILE = path.join(AUTH_DIR, "gemini-state.json");
export const GEMINI_BROWSER_PROFILE = path.join(AUTH_DIR, "browser-profile_gemini");
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-pro";
