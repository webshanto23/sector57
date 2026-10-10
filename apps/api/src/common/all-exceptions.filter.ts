import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';

export type ErrorBody = {
  statusCode: number;
  code: string;
  message: string;
  issues?: { path: string; message: string }[];
  /** Extra facts the client needs, such as `attemptsLeft` after a wrong password. */
  details?: Record<string, unknown>;
};

// Prisma error codes we expect from normal use; anything else is a 500.
const PRISMA_ERRORS: Record<string, [number, string, string]> = {
  P2002: [HttpStatus.CONFLICT, 'conflict', 'This record already exists'],
  P2025: [HttpStatus.NOT_FOUND, 'not_found', 'Record not found'],
};

const codeFromStatus = (status: number) =>
  (HttpStatus[status] ?? 'error').toString().toLowerCase();

/**
 * One error shape for the whole API: `{ statusCode, code, message, issues? }`.
 * Stack traces and database messages are logged, never sent to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) this.logger.error(exception);
    response.status(body.statusCode).json(body);
  }

  toBody(exception: unknown): ErrorBody {
    if (exception instanceof ZodValidationException) {
      const error = exception.getZodError() as ZodError;
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'validation_failed',
        message: 'The request is not valid',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      const fromResponse = typeof res === 'object' && res !== null ? (res as Record<string, unknown>) : {};
      const details = fromResponse['details'];
      return {
        statusCode,
        code: typeof fromResponse['code'] === 'string' ? fromResponse['code'] : codeFromStatus(statusCode),
        message: statusCode >= 500 ? 'Internal server error' : exception.message,
        ...(statusCode < 500 && details && typeof details === 'object' ? { details: details as Record<string, unknown> } : {}),
      };
    }

    const prismaCode = (exception as { code?: unknown } | null)?.code;
    if (typeof prismaCode === 'string' && prismaCode in PRISMA_ERRORS) {
      const [statusCode, code, message] = PRISMA_ERRORS[prismaCode]!;
      return { statusCode, code, message };
    }

    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: 'internal_error', message: 'Internal server error' };
  }
}
