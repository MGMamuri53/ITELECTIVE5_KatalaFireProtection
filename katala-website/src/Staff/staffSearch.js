import { createContext, useContext } from 'react';

export const StaffSearchContext = createContext({
  query: '',
  normalizedQuery: '',
  setQuery: () => {},
  clearQuery: () => {},
});

export function useStaffSearch() {
  return useContext(StaffSearchContext);
}
