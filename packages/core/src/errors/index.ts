export { errorMessage, isUniqueViolation } from "../infra/error-utils";
export {
  NotFoundError,
  ConflictError,
  InternalError,
  InvalidError,
  ForbiddenError,
  mapDomainCatch,
  boundEchoedId,
  MAX_ECHOED_ID_CHARS,
  isDomainTag,
  type DomainTag,
  type NotFoundEntity,
  type DomainTagCode,
} from "../infra/tagged-errors";
