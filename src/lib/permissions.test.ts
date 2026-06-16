import { describe, expect, it } from 'vitest';
import {
  canAccessModule,
  canAccessPricePermission,
  getDefaultLandingPath,
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

  it('treats legacy staff role as store price staff', () => {
    const user = {
      id: 'legacy-staff-user',
      role: 'staff',
      permissions: ['receiving', 'prices', 'settings'],
    };

    expect(getEffectiveModules(user)).toEqual(['prices']);
    expect(canAccessModule(user, 'prices')).toBe(true);
    expect(canAccessModule(user, 'receiving')).toBe(false);
    expect(getDefaultLandingPath(user)).toBe('/prices');
  });

  it('treats warehouse users with only receiving and prices as price staff', () => {
    const user = {
      id: 'legacy-price-user',
      role: 'warehouse',
      permissions: ['receiving', 'prices'],
    };

    expect(getEffectiveModules(user)).toEqual(['prices']);
    expect(canAccessModule(user, 'prices')).toBe(true);
    expect(canAccessModule(user, 'receiving')).toBe(false);
    expect(getDefaultLandingPath(user)).toBe('/prices');
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
