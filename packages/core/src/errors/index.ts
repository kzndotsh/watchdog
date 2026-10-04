export { errorMessage, isUniqueViolation } from "../infra/error-utils";
export {
  NotFoundError,
  ConflictError,
  InternalError,
  InvalidError,
  ForbiddenError,
  mapDomainCatch,
  isDomainTag,
  type DomainTag,
  type NotFoundEntity,
  type DomainTagCode,
} from "../infra/tagged-errors";
