import { describe, expect, it } from 'vitest';

import { fromOf, landingPath } from './landing';

describe('where a person lands after signing in', () => {
  it('goes to the address they were going to, with its query kept', () => {
    expect(landingPath('/report/c1/m2')).toBe('/report/c1/m2');
    expect(landingPath('/?c=abc123')).toBe('/?c=abc123');
    expect(landingPath('/chat/c1?x=1#top')).toBe('/chat/c1?x=1#top');
  });

  it("reads the router's own location object too", () => {
    expect(landingPath({ pathname: '/chat/c1', search: '?c=9', hash: '' })).toBe('/chat/c1?c=9');
    expect(landingPath({ pathname: '/services' })).toBe('/services');
  });

  it('is Today when there is nothing to go back to', () => {
    expect(landingPath(null)).toBe('/');
    expect(landingPath(undefined)).toBe('/');
    expect(landingPath('')).toBe('/');
    expect(landingPath({})).toBe('/');
  });

  it('never leaves the app or loops back to the sign-in screens', () => {
    expect(landingPath('https://example.com/steal')).toBe('/');
    expect(landingPath('//example.com/steal')).toBe('/');
    expect(landingPath('/\\example.com')).toBe('/');
    expect(landingPath('javascript:alert(1)')).toBe('/');
    expect(landingPath('/login')).toBe('/');
    expect(landingPath('/register?r=abc')).toBe('/');
    expect(landingPath('/login/')).toBe('/');
    // A screen whose name only starts the same way is a real screen.
    expect(landingPath('/loginhistory')).toBe('/loginhistory');
    expect(landingPath('/chat/a\nb')).toBe('/');
  });

  it('reads `from` out of a location state', () => {
    expect(fromOf({ from: '/staff' })).toBe('/staff');
    expect(fromOf({ identifier: '9876543210' })).toBeNull();
    expect(fromOf(null)).toBeNull();
    expect(fromOf('nope')).toBeNull();
  });
});
