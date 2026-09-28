import { createContext, useContext } from 'react';

export const AdminSearchContext = createContext({
  query: '',
  normalizedQuery: '',
  setQuery: () => {},
  clearQuery: () => {},
});

export function useAdminSearch() {
  return useContext(AdminSearchContext);
}
