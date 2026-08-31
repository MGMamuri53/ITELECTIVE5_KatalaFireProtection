import { useEffect, useState } from 'react';
import { schemaApi } from '../services/katalaApi';
import { staffMembers as fallbackStaffMembers } from './staffWorkflow';

export function useStaffMembers() {
  const [members, setMembers] = useState(fallbackStaffMembers);

  useEffect(() => {
    let cancelled = false;
    schemaApi.listStaffMembers()
      .then((data) => {
        if (cancelled) return;
        const names = (data.members || []).map((member) => member.name).filter(Boolean);
        setMembers(names.length ? names : fallbackStaffMembers);
      })
      .catch(() => {
        if (!cancelled) setMembers(fallbackStaffMembers);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return members;
}
