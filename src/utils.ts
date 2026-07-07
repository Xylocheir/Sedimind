export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod/.test(userAgent);
}

export function isDesktop(): boolean {
  return !isMobile();
}

export function getPlatform(): "desktop" | "mobile" {
  return isMobile() ? "mobile" : "desktop";
}