import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('maps zod validation errors to 400 with issues', () => {
    class Dto extends createZodDto(z.object({ phone: z.string() })) {}
    let error: unknown;
    try {
      new ZodValidationPipe().transform({}, { type: 'body', metatype: Dto });
    } catch (e) {
      error = e;
    }
    expect(filter.toBody(error)).toEqual({
      statusCode: 400,
      code: 'validation_failed',
      message: 'The request is not valid',
      issues: [{ path: 'phone', message: expect.any(String) }],
    });
  });

  it('keeps a custom code from an HttpException', () => {
    expect(filter.toBody(new NotFoundException({ code: 'society_not_found', message: 'Society not found' }))).toEqual({
      statusCode: 404,
      code: 'society_not_found',
      message: 'Society not found',
    });
  });

  it('passes details through on client errors only', () => {
    const body = { code: 'invalid_credentials', message: 'Wrong phone or password', details: { attemptsLeft: 2 } };
    expect(filter.toBody(new UnauthorizedException(body))).toEqual({ statusCode: 401, ...body });
    expect(filter.toBody(new InternalServerErrorException({ details: { secret: 1 } }))).not.toHaveProperty('details');
  });

  it('derives a code from the status', () => {
    expect(filter.toBody(new BadRequestException('nope'))).toMatchObject({ statusCode: 400, code: 'bad_request' });
  });

  it('maps known Prisma errors', () => {
    expect(filter.toBody({ code: 'P2002', message: 'Unique constraint failed on persons_phone_uq' })).toEqual({
      statusCode: 409,
      code: 'conflict',
      message: 'This record already exists',
    });
  });

  it('hides unknown errors', () => {
    expect(filter.toBody(new Error('password=secret leaked'))).toEqual({
      statusCode: 500,
      code: 'internal_error',
      message: 'Internal server error',
    });
  });
});
