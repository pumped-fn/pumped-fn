import { createDeepProxy, isDeepChanged } from 'proxy-compare';

// Store tracking information for each component
const trackingMap = new WeakMap<object, Set<string | number | symbol>>();

/**
 * Creates a proxy that tracks property access
 */
export function createTrackingProxy<T extends object>(
  value: T,
  componentId: string
): T {
  // Skip primitives and null
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Create a tracking set for this component if it doesn't exist
  if (!trackingMap.has(componentId)) {
    trackingMap.set(componentId, new Set());
  }

  // Create a proxy that tracks property access
  return createDeepProxy(
    value,
    {
      get(target, prop) {
        // Record that this property was accessed by this component
        const trackingSet = trackingMap.get(componentId);
        if (trackingSet) {
          trackingSet.add(prop);
        }
        return Reflect.get(target, prop);
      }
    },
    componentId
  );
}

/**
 * Checks if a tracked value has changed in a way that affects the component
 */
export function hasTrackedChanges<T extends object>(
  prevValue: T,
  nextValue: T,
  componentId: string
): boolean {
  // Skip comparison for primitives and null
  if (prevValue === null || typeof prevValue !== 'object' ||
      nextValue === null || typeof nextValue !== 'object') {
    return prevValue !== nextValue;
  }

  // Get the tracking set for this component
  const trackingSet = trackingMap.get(componentId);
  if (!trackingSet || trackingSet.size === 0) {
    // If nothing was tracked, consider it changed
    return true;
  }

  // Check if any tracked properties have changed
  return isDeepChanged(
    prevValue,
    nextValue,
    componentId
  );
}

/**
 * Clears tracking information for a component
 */
export function clearTracking(componentId: string): void {
  trackingMap.delete(componentId);
}

