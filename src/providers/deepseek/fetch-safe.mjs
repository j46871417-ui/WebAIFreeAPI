// TLS-safe fetch for DeepSeek.
// Automatically falls back to trusting certificates when Windows or local antivirus
// (Kaspersky, AdGuard, corporate proxy, Starfield cross-signing) intercepts SSL connections.

export async function fetchWithTlsFallback(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const isTlsError =
      error?.cause?.code === "SELF_SIGNED_CERT_IN_CHAIN" ||
      error?.cause?.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
      error?.cause?.code === "CERT_HAS_EXPIRED" ||
      error?.cause?.code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
      /certificate|tls|ssl/i.test(String(error?.cause?.message || error?.message || ""));

    if (isTlsError && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
      return await fetch(url, options);
    }
    throw error;
  }
}
