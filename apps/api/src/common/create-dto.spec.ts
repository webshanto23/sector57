import { z } from 'zod';
import { createDto, splitNullableTypes } from './create-dto.js';

type WithFactory = { _OPENAPI_METADATA_FACTORY(): Record<string, any> };

describe('splitNullableTypes', () => {
  it('turns a type list with null into anyOf', () => {
    expect(splitNullableTypes({ type: ['string', 'null'], minLength: 1, required: true, 'x-a': 1 })).toEqual({
      required: true,
      'x-a': 1,
      anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
    });
  });

  it('walks nested properties and leaves other nodes alone', () => {
    const input = { type: 'object', properties: { a: { type: ['integer', 'null'] }, b: { type: 'string' } } };
    expect(splitNullableTypes(input)).toEqual({
      type: 'object',
      properties: { a: { anyOf: [{ type: 'integer' }, { type: 'null' }] }, b: { type: 'string' } },
    });
  });
});

describe('createDto', () => {
  class ThingDto extends createDto(z.object({ name: z.string(), nameEn: z.string().nullable() })) {}

  it('fixes nullable fields in input and output metadata', () => {
    const input = (ThingDto as unknown as WithFactory)._OPENAPI_METADATA_FACTORY();
    const output = (ThingDto.Output as unknown as WithFactory)._OPENAPI_METADATA_FACTORY();
    for (const meta of [input, output]) {
      expect(meta['nameEn'].anyOf).toEqual([{ type: 'string' }, { type: 'null' }]);
      expect(meta['nameEn'].type).toBe('');
    }
  });

  it('returns one cached Output class named after the subclass', () => {
    expect(ThingDto.Output).toBe(ThingDto.Output);
    expect(ThingDto.Output.name).toBe('ThingDto_Output');
  });
});
