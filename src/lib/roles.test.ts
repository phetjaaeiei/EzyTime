import { expect, it } from 'vitest';
import { ASSIGNABLE_ROLES, staffRoleLabel } from './roles';

it('labels every staff role and the no-role case', () => {
  expect(staffRoleLabel('admin')).toBe('Admin');
  expect(staffRoleLabel('ceo')).toBe('CEO');
  expect(staffRoleLabel('manager')).toBe('Manager');
  expect(staffRoleLabel(null)).toBe('ไม่มีสิทธิ์ผู้ดูแล');
});

it('only offers ceo and manager as assignable roles (admin is never assignable here)', () => {
  expect(ASSIGNABLE_ROLES).toEqual(['ceo', 'manager']);
  expect(ASSIGNABLE_ROLES).not.toContain('admin');
});
