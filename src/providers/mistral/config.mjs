import path from "node:path";
import { AUTH_DIR } from "../../config.mjs";

export const MISTRAL_BASE_URL = "https://chat.mistral.ai";
export const MISTRAL_AUTH_FILE = path.join(AUTH_DIR, "mistral-state.json");
export const MISTRAL_BROWSER_PROFILE = path.join(AUTH_DIR, "browser-profile_mistral");
export const MISTRAL_DEFAULT_MODEL = "mistral-large";
