import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BACKGROUND_SERVICE_IDS,
  OWNER_ONLY_SERVICE_IDS,
  SERVICE_LABELS,
  STANDARD_PACKAGE_SERVICE_IDS,
} from '@dk/shared';
import { REPORT_KINDS, type TodayTaskKind } from '@dk/shared/types';

import {
  HIDDEN_SERVICE_IDS,
  HUB_GROUPS,
  KAVACH_ROW,
  OWNER_ONLY_IDS,
  SERVICE_MAP,
  groupOf,
  hasServicePage,
  isHiddenService,
  isOwnerOnlyService,
  isServiceVisible,
  kindsOfService,
  serviceOfKind,
  serviceSpec,
  servicesInGroup,
  taskKindService,
  videoFor,
} from './serviceMap';

describe('serviceMap covers every service the drift test knows', () => {
  const labelled = Object.keys(SERVICE_LABELS);

  it('has an entry for every id in SERVICE_LABELS, and no entry without a label', () => {
    expect(Object.keys(SERVICE_MAP).filter((id) => !(id in SERVICE_LABELS))).toEqual([]);
    expect(labelled.filter((id) => !(id in SERVICE_MAP))).toEqual([]);
  });

  it('gives every id a group, and the group is one of the known ones', () => {
    for (const id of labelled) {
      expect(['daily', 'filed', 'ask', 'feeds', 'hidden', 'button']).toContain(
        SERVICE_MAP[id]!.group,
      );
    }
  });

  it('covers every registered plugin of the backend (the drift test holds the labels equal to them)', () => {
    const dir = resolve(process.cwd(), '../mdg-backend/src/services');
    if (!existsSync(dir)) return; // the client repo alone: the label check above is the guard
    const plugins = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^[a-z]+(-[a-z]+)+$/.test(e.name))
      .map((e) => e.name)
      .filter((name) => {
        const index = resolve(dir, name, 'index.ts');
        return existsSync(index) && /PLUGIN_ID\s*=|id:\s*'/.test(readFileSync(index, 'utf8'));
      });
    expect(plugins.length).toBeGreaterThan(20);
    expect(plugins.filter((id) => !(id in SERVICE_MAP))).toEqual([]);
  });

  it('every service in the standard package has a hub place', () => {
    for (const id of STANDARD_PACKAGE_SERVICE_IDS) {
      expect(serviceSpec(id), id).toBeDefined();
      expect(isHiddenService(id), id).toBe(false);
    }
  });
});

describe('serviceMap hides every background id', () => {
  it('every id the shared list calls background is hidden, a hub row of no kind', () => {
    for (const id of BACKGROUND_SERVICE_IDS) {
      expect(isHiddenService(id), id).toBe(true);
      expect(isServiceVisible(id, true), id).toBe(false);
      expect(isServiceVisible(id, false), id).toBe(false);
      expect(groupOf(id), id).toBeNull();
      expect(hasServicePage(id), id).toBe(false);
    }
  });

  it('the four ids spec 4.2 names are never listed, even against an older shared list', () => {
    for (const id of [
      'hpcl-account',
      'sdms-password-reset',
      'sdms-old-password-reset',
      'iras-password-reset',
    ]) {
      expect(HIDDEN_SERVICE_IDS.has(id)).toBe(true);
      expect(isHiddenService(id)).toBe(true);
    }
  });

  it('the hidden set holds all of the shared background list', () => {
    for (const id of BACKGROUND_SERVICE_IDS) expect(HIDDEN_SERVICE_IDS.has(id)).toBe(true);
  });

  it('no list the hub draws holds a hidden id', () => {
    for (const owner of [true, false]) {
      for (const group of HUB_GROUPS) {
        for (const id of servicesInGroup(group, owner)) expect(isHiddenService(id), id).toBe(false);
      }
    }
  });

  it('an id this build does not know is hidden, never printed as a raw id', () => {
    expect(isHiddenService('a-brand-new-plugin')).toBe(true);
    expect(isServiceVisible('a-brand-new-plugin', true)).toBe(false);
    expect(groupOf('a-brand-new-plugin')).toBeNull();
  });

  it('custom-request is the button, not a row', () => {
    expect(isHiddenService('custom-request')).toBe(true);
    expect(groupOf('custom-request')).toBeNull();
  });
});

describe('the hub groups (spec 4.2)', () => {
  it('Every day for you, in order (Kavach is drawn first by the page, not here)', () => {
    expect(servicesInGroup('daily', true)).toEqual([
      'dsr-report',
      'credit-dod-monitoring',
      'water-ingress-testing',
      'load-planner',
      'tt-density',
      'tanker-documents',
    ]);
  });

  it('Filed for you', () => {
    expect(servicesInGroup('filed', true)).toEqual([
      'dealer-declarations',
      'du-otp-acknowledgement',
      'tt-acknowledgement',
      'mock-drill',
      'electrical-audit',
      'calibration-claim',
      'fuel-indent',
      'maintenance-complaints',
      'work-permits',
    ]);
  });

  it('When you ask', () => {
    expect(servicesInGroup('ask', true)).toEqual(['stock-check', 'ro-supply-status']);
  });

  it('Behind the scenes is five data feeds', () => {
    expect(servicesInGroup('feeds', true).sort()).toEqual(
      [
        'bpcl-iot-data',
        'hpcl-inspection-reports',
        'hpcl-portal-data',
        'inspection-reports',
        'iras-shift-data',
      ].sort(),
    );
  });

  it('a manager loses exactly the owner-only services', () => {
    expect(servicesInGroup('daily', false)).not.toContain('credit-dod-monitoring');
    expect(servicesInGroup('filed', false)).not.toContain('calibration-claim');
    const all = HUB_GROUPS.flatMap((g) => servicesInGroup(g, true));
    const mine = HUB_GROUPS.flatMap((g) => servicesInGroup(g, false));
    expect(all.filter((id) => !mine.includes(id)).sort()).toEqual(
      [...OWNER_ONLY_SERVICE_IDS].sort(),
    );
  });

  it('groupOf answers the group of a listed id', () => {
    expect(groupOf('dsr-report')).toBe('daily');
    expect(groupOf('mock-drill')).toBe('filed');
    expect(groupOf('stock-check')).toBe('ask');
    expect(groupOf('iras-shift-data')).toBe('feeds');
  });
});

describe('owner-only services', () => {
  it('are the two the spec names, from the shared list and from this map', () => {
    expect([...OWNER_ONLY_SERVICE_IDS].sort()).toEqual([
      'calibration-claim',
      'credit-dod-monitoring',
    ]);
    expect([...OWNER_ONLY_IDS].sort()).toEqual(['calibration-claim', 'credit-dod-monitoring']);
  });

  it('a manager sees neither the row nor the page', () => {
    for (const id of OWNER_ONLY_SERVICE_IDS) {
      expect(isOwnerOnlyService(id)).toBe(true);
      expect(isServiceVisible(id, false)).toBe(false);
      expect(hasServicePage(id, false)).toBe(false);
      expect(isServiceVisible(id, true)).toBe(true);
      expect(hasServicePage(id, true)).toBe(true);
    }
  });

  it('an owner-only report kind belongs to an owner-only service and the reverse', () => {
    expect(serviceOfKind('credit_dod')).toBe('credit-dod-monitoring');
    expect(serviceOfKind('ledger_watch')).toBe('credit-dod-monitoring');
    expect(serviceOfKind('calibration_claim')).toBe('calibration-claim');
  });
});

describe('kinds and pages', () => {
  it('every report kind except the announcement belongs to exactly one service', () => {
    for (const kind of REPORT_KINDS) {
      if (kind === 'announcement') {
        expect(serviceOfKind(kind)).toBeNull();
        continue;
      }
      const owners = Object.values(SERVICE_MAP).filter((s) => s.kinds.includes(kind));
      expect(
        owners.map((s) => s.id),
        kind,
      ).toHaveLength(1);
      expect(serviceOfKind(kind)).toBe(owners[0]!.id);
    }
  });

  it('the two DSR sheets belong to the DSR service (a message with both is tagged dsr_variation)', () => {
    expect(kindsOfService('dsr-report')).toEqual(['dsr_sales', 'dsr_variation']);
  });

  it('a chat box has no report kind and says which box it is', () => {
    expect(kindsOfService('maintenance-complaints')).toEqual([]);
    expect(serviceSpec('maintenance-complaints')?.box).toBe('complaints');
    expect(serviceSpec('work-permits')?.box).toBe('work-permits');
  });

  it('a service that is not known has no kinds', () => {
    expect(kindsOfService('nope')).toEqual([]);
  });

  it('templates follow the spec: A daily report, B filing, C check when you ask', () => {
    expect(serviceSpec('dsr-report')?.template).toBe('A');
    expect(serviceSpec('tt-acknowledgement')?.template).toBe('B');
    expect(serviceSpec('stock-check')?.template).toBe('C');
    expect(serviceSpec('ro-supply-status')?.template).toBe('C');
  });

  it('a data feed gets a hub row and no page', () => {
    for (const id of servicesInGroup('feeds', true)) expect(hasServicePage(id), id).toBe(false);
    expect(hasServicePage('dsr-report')).toBe(true);
    expect(hasServicePage('does-not-exist')).toBe(false);
  });
});

describe('taskKindService', () => {
  const table: Array<[TodayTaskKind, string | undefined, string | null]> = [
    ['du_otp', undefined, 'du-otp-acknowledgement'],
    ['mock_drill', undefined, 'mock-drill'],
    ['declarations', undefined, 'dealer-declarations'],
    ['complaint', undefined, 'maintenance-complaints'],
    ['work_permit', undefined, 'work-permits'],
    ['fuel_confirm', undefined, 'fuel-indent'],
    ['sign_letter', undefined, 'calibration-claim'],
    ['wemmis_login', undefined, 'calibration-claim'],
    ['ask', 'reg:2026-11-26', 'tt-density'],
    ['ask', 'kv:abc', KAVACH_ROW],
    ['ask', 'doc:123', null],
    ['ask', undefined, null],
    ['portal_login', undefined, null],
    ['password_pick', undefined, null],
    ['outlet_details', undefined, null],
    ['setup', undefined, null],
  ];
  it.each(table)('%s %s belongs to %s', (kind, ref, want) => {
    expect(taskKindService(kind, ref)).toBe(want);
  });

  it('every service a task names is a service this map knows (or the Kavach row)', () => {
    for (const [kind, ref] of table) {
      const id = taskKindService(kind, ref);
      if (id && id !== KAVACH_ROW) expect(serviceSpec(id), id).toBeDefined();
    }
  });
});

describe('videoFor', () => {
  const videos = [
    { id: 'v1', service: 'dsr-report', available: false },
    { id: 'v2', service: 'dsr-report', available: true },
    { id: 'v3', service: 'mock-drill', available: true },
  ];
  it('is the first uploaded video tagged with the service', () => {
    expect(videoFor('dsr-report', videos)).toBe('v2');
    expect(videoFor('mock-drill', videos)).toBe('v3');
  });
  it('is nothing when none is tagged or the library is not here', () => {
    expect(videoFor('stock-check', videos)).toBeUndefined();
    expect(videoFor('dsr-report', undefined)).toBeUndefined();
    expect(videoFor('dsr-report', [])).toBeUndefined();
  });
});
