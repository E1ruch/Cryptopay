import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError, toAppError, toApiErrorResponse } from '@cryptopay/shared';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  429: 'rate_limited',
};

function mapHttpException(exception: HttpException): AppError {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const responseMessage =
    typeof response === 'string' ? response : (response as { message?: unknown }).message;

  const message = Array.isArray(responseMessage)
    ? responseMessage.join(', ')
    : typeof responseMessage === 'string'
      ? responseMessage
      : exception.message;

  return new AppError(CODE_BY_STATUS[status] ?? 'http_error', message, { httpStatus: status });
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const appError =
      exception instanceof HttpException ? mapHttpException(exception) : toAppError(exception);

    if (appError.httpStatus >= 500) {
      request.log.error({ err: exception, code: appError.code }, 'Unhandled error');
    } else {
      request.log.warn({ code: appError.code }, appError.message);
    }

    const body = toApiErrorResponse(appError, String(request.id));
    void response.status(appError.httpStatus).send(body);
  }
}
