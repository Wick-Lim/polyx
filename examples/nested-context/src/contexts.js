import { createContext } from '@polyx/runtime';

// UserContext: polyx-ctx-provider-1
export const UserContext = createContext({
  name: 'Guest',
  email: 'guest@example.com',
  role: 'viewer',
});

// PreferencesContext: polyx-ctx-provider-2
export const PreferencesContext = createContext({
  fontSize: 14,
  colorScheme: 'light',
  compactMode: false,
});

// PermissionsContext: polyx-ctx-provider-3
export const PermissionsContext = createContext({
  canEdit: false,
  canDelete: false,
  accessLevel: 'read',
});
