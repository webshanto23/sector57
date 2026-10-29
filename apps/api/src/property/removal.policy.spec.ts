import { removalPlan, type RemovalNode } from './removal.policy.js';

const place = (id: string, parentId = 'building'): RemovalNode => ({ id, name: id, isUnit: false, parentId, joined: false });
const unit = (id: string, parentId: string, joined = false): RemovalNode => ({ id, name: id, isUnit: true, parentId, joined });

describe('removalPlan', () => {
  it('takes a floor with the units on it, and picked units on their own', () => {
    expect(removalPlan([place('f1'), unit('u9', 'building')], [unit('1A', 'f1'), unit('1B', 'f1')])).toEqual({
      unitIds: ['u9', '1A', '1B'],
      placeIds: ['f1'],
    });
  });

  it('counts a unit once when it is picked and also inside a picked floor', () => {
    expect(removalPlan([place('f1'), unit('1A', 'f1')], [unit('1A', 'f1')])).toEqual({ unitIds: ['1A'], placeIds: ['f1'] });
  });

  it('never takes places inside a picked place', () => {
    expect(removalPlan([place('road'), place('f1')], [place('plot', 'road'), unit('1A', 'f1')])).toEqual({ problem: 'has_places', names: ['road'] });
    // A picked child of a picked place is fine.
    expect(removalPlan([place('road'), place('plot', 'road')], [place('plot', 'road')])).toEqual({ unitIds: [], placeIds: ['road', 'plot'] });
  });

  it('refuses joined units, picked or inside a floor', () => {
    expect(removalPlan([unit('5A', 'f5', true)], [])).toEqual({ problem: 'joined', names: ['5A'] });
    expect(removalPlan([place('f6')], [unit('6A', 'f6', true), unit('6B', 'f6')])).toEqual({ problem: 'joined', names: ['6A'] });
  });
});
