import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import './index.css';
import App from './App';

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const root = createRoot(document.getElementById('root')!);

if (convexUrl && clerkKey) {
  const convex = new ConvexReactClient(convexUrl);
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={clerkKey}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <App convexEnabled clerkEnabled />
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </StrictMode>,
  );
} else if (convexUrl) {
  const convex = new ConvexReactClient(convexUrl);
  root.render(
    <StrictMode>
      <ConvexProvider client={convex}>
        <App convexEnabled />
      </ConvexProvider>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App convexEnabled={false} />
    </StrictMode>,
  );
}
