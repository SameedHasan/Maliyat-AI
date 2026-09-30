/** Whether the app should lock again after being in the background since `backgroundedAt`. */
export function shouldRelock(backgroundedAt: number, now: number, timeoutSeconds: number): boolean {
  return now - backgroundedAt >= timeoutSeconds * 1000;
}
