import { createZodDto } from 'nestjs-zod';

type Json = Record<string, unknown>;

// Keys that describe the property itself rather than its value type.
const OUTER_KEYS = new Set(['required', 'description', 'title', 'default', 'deprecated']);

/**
 * zod 4.6 writes a nullable primitive as `type: ['string', 'null']`, which
 * @nestjs/swagger mistakes for an array of strings. Rewrite it as
 * `anyOf: [{ type: 'string', ... }, { type: 'null' }]`, which both understand.
 */
export function splitNullableTypes<T>(node: T): T {
  if (Array.isArray(node)) return node.map(splitNullableTypes) as T;
  if (node === null || typeof node !== 'object') return node;

  const entries = Object.entries(node as Json).map(([key, value]) => [key, splitNullableTypes(value)] as const);
  const copy: Json = Object.fromEntries(entries);
  const types = copy['type'];
  if (!Array.isArray(types) || !types.includes('null')) return copy as T;

  const outer: Json = {};
  const inner: Json = {};
  for (const [key, value] of Object.entries(copy)) {
    if (key === 'type') continue;
    if (OUTER_KEYS.has(key) || key.startsWith('x-')) outer[key] = value;
    else inner[key] = value;
  }
  const branches = types.filter((type) => type !== 'null').map((type) => ({ type, ...inner }));
  return { ...outer, anyOf: [...branches, { type: 'null' }] } as T;
}

function patchMetadata(dto: object): void {
  const original = Reflect.get(dto, '_OPENAPI_METADATA_FACTORY') as (this: object) => Json;
  Object.defineProperty(dto, '_OPENAPI_METADATA_FACTORY', {
    configurable: true,
    value: () => {
      const properties = splitNullableTypes(original.call(dto));
      // nestjs-zod's convention for properties without a single type: an empty
      // `type` that cleanupOpenApiDoc removes again. @nestjs/swagger needs the key.
      for (const property of Object.values(properties)) {
        const schema = property as Json;
        if (!('type' in schema)) schema['type'] = '';
      }
      return properties;
    },
  });
}

/**
 * `createZodDto` plus the nullable fix above, for request and response DTOs.
 * Use this instead of `createZodDto` everywhere in the API.
 */
export function createDto<TSchema extends Parameters<typeof createZodDto>[0]>(schema: TSchema) {
  const Dto = createZodDto(schema);
  patchMetadata(Dto);

  // `Dto.Output` builds a fresh class on every access, named after the subclass;
  // patch and cache one per subclass so Swagger sees a single schema.
  const outputDescriptor = Object.getOwnPropertyDescriptor(Dto, 'Output');
  if (outputDescriptor?.get) {
    const cache = new WeakMap<object, object>();
    Object.defineProperty(Dto, 'Output', {
      configurable: true,
      get(this: object) {
        let output = cache.get(this);
        if (!output) {
          output = outputDescriptor.get!.call(this) as object;
          patchMetadata(output);
          cache.set(this, output);
        }
        return output;
      },
    });
  }
  return Dto;
}
