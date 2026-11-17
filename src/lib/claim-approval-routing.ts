export function isActiveAssignedManagerSubmitter(input: {
  submitterEmail: string;
  managerEmail: string;
  managerRole?: string | null;
  managerActive?: boolean;
}) {
  return Boolean(
    input.managerActive
    && input.managerRole === 'Manager'
    && String(input.submitterEmail || '').trim().toLowerCase() !== ''
    && String(input.submitterEmail || '').trim().toLowerCase() === String(input.managerEmail || '').trim().toLowerCase(),
  );
}
