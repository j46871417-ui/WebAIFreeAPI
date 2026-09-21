// Утилиты валидации сессии и интерфейса Mistral (chat.mistral.ai).

export function isMistralCookieDomain(domain) {
  if (!domain || typeof domain !== "string") return false;
  return /(^|\.)mistral\.ai$/i.test(domain);
}

export function isMistralAuthUsable(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return false;
  }

  const mistralCookies = cookies.filter((c) => c && isMistralCookieDomain(c.domain));
  if (mistralCookies.length === 0) {
    return false;
  }

  // Наличие сессионных токенов, CSRF или Cloudflare clearance на mistral.ai
  // Важно: кука anonymousUser НЕ дисквалифицирует сессию, так как Mistral оставляет её на 1 год.
  const hasSignificantCookie = mistralCookies.some((c) => {
    const name = String(c?.name || "").toLowerCase();
    if (!name || name.includes("intercom")) return false;
    return (
      name === "csrftoken" ||
      name === "cf_clearance" ||
      name === "mistral_session" ||
      name === "app_session" ||
      name.includes("session-token") ||
      name === "__secure-next-auth.session-token" ||
      name === "authjs.session-token" ||
      (name.includes("session") && !name.includes("anonymous"))
    );
  });

  return hasSignificantCookie || mistralCookies.length >= 2;
}

export function isMistralAuthRoute(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.hostname !== "chat.mistral.ai") {
      return true;
    }
    const path = u.pathname.toLowerCase();
    return (
      path.startsWith("/auth") ||
      path.startsWith("/login") ||
      path.startsWith("/signin") ||
      path.startsWith("/callback")
    );
  } catch {
    return true;
  }
}

export function evaluateMistralPageState({ url, hasComposer, visibleSignInButtons = [] }) {
  const isAuthRoute = isMistralAuthRoute(url);
  const hasVisibleSignIn = Array.isArray(visibleSignInButtons) && visibleSignInButtons.length > 0;
  const isLoggedIn = !isAuthRoute && Boolean(hasComposer) && !hasVisibleSignIn;

  return {
    isAuthRoute,
    hasVisibleSignIn,
    isLoggedIn,
  };
}
