import React, { useState } from 'react';
import { createExecutor } from '@pumped-fn/core-next';
import { 
  EnhancedScopeProvider, 
  useEnhancedResolve, 
  useEnhancedUpdate 
} from '../enhanced-scope';

// Create a complex nested data structure
const userExecutor = createExecutor(() => ({
  profile: {
    name: 'John Doe',
    age: 30,
    email: 'john@example.com',
  },
  preferences: {
    theme: 'dark',
    notifications: {
      email: true,
      push: false,
      sms: true,
    },
  },
  posts: [
    { id: 1, title: 'First Post', likes: 10 },
    { id: 2, title: 'Second Post', likes: 15 },
    { id: 3, title: 'Third Post', likes: 5 },
  ],
}));

// Component that only uses profile.name
function UserName() {
  console.log('UserName component rendering');
  const user = useEnhancedResolve(userExecutor);
  
  // This component will only re-render if user.profile.name changes
  return <h2>{user.profile.name}</h2>;
}

// Component that only uses preferences.theme
function ThemeDisplay() {
  console.log('ThemeDisplay component rendering');
  const user = useEnhancedResolve(userExecutor);
  
  // This component will only re-render if user.preferences.theme changes
  return <div>Current theme: {user.preferences.theme}</div>;
}

// Component that only uses notifications
function NotificationSettings() {
  console.log('NotificationSettings component rendering');
  const user = useEnhancedResolve(userExecutor);
  const updateUser = useEnhancedUpdate(userExecutor);
  
  // This component will only re-render if notification settings change
  const toggleEmailNotifications = () => {
    updateUser((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        notifications: {
          ...current.preferences.notifications,
          email: !current.preferences.notifications.email,
        },
      },
    }));
  };
  
  return (
    <div>
      <h3>Notification Settings</h3>
      <label>
        <input
          type="checkbox"
          checked={user.preferences.notifications.email}
          onChange={toggleEmailNotifications}
        />
        Email Notifications
      </label>
      <div>
        {user.preferences.notifications.email 
          ? 'You will receive email notifications' 
          : 'Email notifications are disabled'}
      </div>
    </div>
  );
}

// Component that only uses posts
function PostsList() {
  console.log('PostsList component rendering');
  const user = useEnhancedResolve(userExecutor);
  const updateUser = useEnhancedUpdate(userExecutor);
  
  // This component will only re-render if posts change
  const incrementLikes = (postId: number) => {
    updateUser((current) => ({
      ...current,
      posts: current.posts.map(post => 
        post.id === postId 
          ? { ...post, likes: post.likes + 1 } 
          : post
      ),
    }));
  };
  
  return (
    <div>
      <h3>Posts</h3>
      <ul>
        {user.posts.map(post => (
          <li key={post.id}>
            {post.title} - {post.likes} likes
            <button onClick={() => incrementLikes(post.id)}>Like</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Parent component that contains all the child components
function UserProfile() {
  console.log('UserProfile component rendering');
  const [count, setCount] = useState(0);
  
  // This state change won't cause child components to re-render
  // unless their tracked properties change
  const incrementCounter = () => {
    setCount(c => c + 1);
  };
  
  return (
    <div>
      <h1>User Profile</h1>
      <button onClick={incrementCounter}>
        Increment Counter: {count}
      </button>
      
      <UserName />
      <ThemeDisplay />
      <NotificationSettings />
      <PostsList />
    </div>
  );
}

// Root component with the enhanced scope provider
export function ProxyTrackingExample() {
  return (
    <EnhancedScopeProvider>
      <UserProfile />
    </EnhancedScopeProvider>
  );
}

