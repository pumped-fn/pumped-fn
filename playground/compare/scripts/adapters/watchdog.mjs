export function startWatchdog(timeoutMs, onTimeout) {
  const timer = setTimeout(onTimeout, timeoutMs)
  return () => clearTimeout(timer)
}
