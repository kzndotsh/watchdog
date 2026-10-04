export { errorMessage, isUniqueViolation } from "../infra/error-utils";
export {
  NotFoundError,
  ConflictError,
  InternalError,
  InvalidError,
  ForbiddenError,
  mapDomainCatch,
  domainMessageOf,
  isDomainTag,
  type DomainTag,
  type DomainTagCode,
} from "../infra/tagged-errors";
