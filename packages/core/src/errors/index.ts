export {
  DomainError,
  errorMessage,
  isUniqueViolation,
  type DomainErrorCode,
} from "../infra/domain-error";
export {
  NotFoundError,
  ConflictError,
  InternalError,
  InvalidError,
  ForbiddenError,
  fromDomainError,
  mapDomainCatch,
  domainCodeOf,
  domainMessageOf,
  isDomainTag,
  toDomainError,
  type DomainTag,
  type DomainTagCode,
} from "../infra/tagged-errors";
