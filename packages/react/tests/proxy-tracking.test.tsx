import { describe, it, expect, vi } from 'vitest';
import { createTrackingProxy, hasTrackedChanges } from '../src/proxy-tracking';

describe('Proxy Tracking', () => {
  it('should track property access', () => {
    const user = {
      name: 'John',
      age: 30,
      address: {
        street: '123 Main St',
        city: 'New York',
        zip: '10001'
      }
    };
    
    const trackingMap = new WeakMap<object, unknown>();
    const trackedUser = createTrackingProxy(user, trackingMap);
    
    // Access some properties
    const name = trackedUser.name;
    const city = trackedUser.address.city;
    
    // Create a new object with changes
    const updatedUser = {
      ...user,
      name: 'Jane', // Changed
      age: 30,      // Same
      address: {
        ...user.address,
        city: 'Boston', // Changed
        zip: '10001'    // Same
      }
    };
    
    // Should detect changes to tracked properties
    expect(hasTrackedChanges(user, updatedUser, trackingMap)).toBe(true);
    
    // Create a new object with changes only to untracked properties
    const unrelatedChanges = {
      ...user,
      age: 31,      // Changed but not tracked
      address: {
        ...user.address,
        street: 'New Street', // Changed but not tracked
        zip: '20002'          // Changed but not tracked
      }
    };
    
    // Should not detect changes to untracked properties
    expect(hasTrackedChanges(user, unrelatedChanges, trackingMap)).toBe(false);
  });
  
  it('should handle nested property access', () => {
    const data = {
      user: {
        profile: {
          name: 'John',
          details: {
            age: 30,
            occupation: 'Developer'
          }
        },
        settings: {
          theme: 'dark',
          notifications: true
        }
      }
    };
    
    const trackingMap = new WeakMap<object, unknown>();
    const trackedData = createTrackingProxy(data, trackingMap);
    
    // Access deeply nested properties
    const name = trackedData.user.profile.name;
    const occupation = trackedData.user.profile.details.occupation;
    
    // Create a new object with changes to tracked nested properties
    const updatedData = {
      user: {
        profile: {
          name: 'Jane', // Changed and tracked
          details: {
            age: 30,
            occupation: 'Designer' // Changed and tracked
          }
        },
        settings: {
          theme: 'dark',
          notifications: true
        }
      }
    };
    
    // Should detect changes to tracked nested properties
    expect(hasTrackedChanges(data, updatedData, trackingMap)).toBe(true);
    
    // Create a new object with changes only to untracked nested properties
    const unrelatedChanges = {
      user: {
        profile: {
          name: 'John', // Same
          details: {
            age: 31, // Changed but not tracked
            occupation: 'Developer' // Same
          }
        },
        settings: {
          theme: 'light', // Changed but not tracked
          notifications: false // Changed but not tracked
        }
      }
    };
    
    // Should not detect changes to untracked nested properties
    expect(hasTrackedChanges(data, unrelatedChanges, trackingMap)).toBe(false);
  });
});
