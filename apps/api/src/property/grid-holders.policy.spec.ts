import { gridHolders, type Party } from './grid-holders.policy.js';

const party = (key: string, name = key): Party => ({ key, name, nameEn: null });
const abc = party('organisation:abc', 'ABC Ltd');
const rahim = party('person:rahim', 'রহিম');
const karim = party('person:karim', 'করিম');

describe('gridHolders', () => {
  it('shows the renter, else the owner, else nobody', () => {
    const holders = gridHolders(
      new Map([
        ['3A', { owners: [rahim], renters: [abc] }],
        ['3B', { owners: [rahim], renters: [] }],
        ['3C', { owners: [], renters: [] }],
      ]),
    );
    expect(holders.get('3A')).toMatchObject({ name: 'ABC Ltd', role: 'renter', more: 0, units: 1 });
    expect(holders.get('3B')).toMatchObject({ name: 'রহিম', role: 'owner', more: 0, units: 2 });
    expect(holders.get('3C')).toBeNull();
  });

  it('counts every unit one party holds in the building, as owner or renter', () => {
    const holders = gridHolders(
      new Map([
        ['3A', { owners: [rahim], renters: [abc] }],
        ['3B', { owners: [karim], renters: [abc] }],
        ['4A', { owners: [abc], renters: [] }],
      ]),
    );
    expect(['3A', '3B', '4A'].map((id) => holders.get(id)?.units)).toEqual([3, 3, 3]);
  });

  it('names the first of joint owners with the rest as a count', () => {
    expect(gridHolders(new Map([['5A', { owners: [rahim, karim], renters: [] }]])).get('5A')).toMatchObject({ name: 'রহিম', more: 1 });
  });

  it('leaves out people the caller may not view', () => {
    const holders = gridHolders(
      new Map([
        ['3A', { owners: null, renters: null }],
        ['3B', { owners: null, renters: [abc] }],
        ['3C', { owners: [abc], renters: null }],
      ]),
    );
    expect(holders.get('3A')).toBeNull();
    expect(holders.get('3B')).toMatchObject({ role: 'renter', units: 2 });
    expect(holders.get('3C')).toMatchObject({ role: 'owner', units: 2 });
  });
});
