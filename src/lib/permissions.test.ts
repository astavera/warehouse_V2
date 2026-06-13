import { describe, expect, it } from 'vitest';
import {
  canAccessModule,
  canAccessPricePermission,
  getEffectiveModules,
  SEBASTIAN_ADMIN_AUTH_USER_ID,
} from './permissions';

describe('permissions', () => {
  it('limits store staff to prices only', () => {
    const user = {
      id: 'store-user',
      role: 'store',
      permissions: ['receiving', 'prices', 'settings'],
    };

    expect(getEffectiveModules(user)).toEqual(['prices']);
    expect(canAccessModule(user, 'prices')).toBe(true);
    expect(canAccessModule(user, 'receiving')).toBe(false);
    expect(canAccessModule(user, 'settings')).toBe(false);
  });

  it('allows only Sebastian admin id to manage prices', () => {
    expect(
      canAccessPricePermission(
        { auth_user_id: SEBASTIAN_ADMIN_AUTH_USER_ID, role: 'admin', permissions: ['prices'] },
        'prices.manage'
      )
    ).toBe(true);
    expect(
      canAccessPricePermission(
        { id: 'other-admin', role: 'admin', permissions: ['prices'] },
        'prices.manage'
      )
    ).toBe(false);
  });
});
