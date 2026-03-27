/** 홈·코치 관리자 모드와 동일한 sessionStorage 키 (page.tsx 와 공유) */
export const ADMIN_PIN_SESSION_KEY = "tmt:adminPin";
export const ADMIN_MODE_STORAGE_KEY = "tmt:adminMode";

function shouldAttachAdminPin(input: RequestInfo | URL): boolean {
  try {
    if (typeof input === "string") {
      return input.startsWith("/api/");
    }
    if (input instanceof URL) {
      return input.pathname.startsWith("/api/");
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      return new URL(input.url).pathname.startsWith("/api/");
    }
  } catch {
    return false;
  }
  return false;
}

/** 관리자 모드일 때 `/api/*` 요청에 x-admin-pin 을 붙입니다. */
export function installCoachAdminFetchInterceptor(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const origFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!shouldAttachAdminPin(input)) {
      return origFetch(input, init);
    }
    try {
      if (window.localStorage.getItem(ADMIN_MODE_STORAGE_KEY) !== "on") {
        return origFetch(input, init);
      }
      const pin = sessionStorage.getItem(ADMIN_PIN_SESSION_KEY);
      if (!pin) {
        return origFetch(input, init);
      }
      const headers = new Headers(init?.headers);
      if (!headers.has("x-admin-pin")) {
        headers.set("x-admin-pin", pin);
      }
      return origFetch(input, { ...init, headers });
    } catch {
      return origFetch(input, init);
    }
  };

  return () => {
    window.fetch = origFetch;
  };
}
