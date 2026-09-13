import path from "node:path";
import { AUTH_DIR } from "../../config.mjs";

export const GROK_BASE_URL = "https://grok.com";
export const GROK_AUTH_FILE = path.join(AUTH_DIR, "grok-state.json");
export const GROK_BROWSER_PROFILE = path.join(AUTH_DIR, "browser-profile_grok");
export const GROK_DEFAULT_MODEL = "grok-3";
