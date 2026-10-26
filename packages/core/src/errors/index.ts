export { errorMessage, isUniqueViolation } from "../infra/error-utils";
export {
  NotFoundError,
  ConflictError,
  StaleVersionError,
  JobStartLimitError,
  StaleCursorError,
  VERSIONED_ENTITIES,
  type VersionedEntity,
  InternalError,
  InvalidError,
  ForbiddenError,
  NOT_FOUND_ENTITIES,
  mapDomainCatch,
  boundEchoedId,
  MAX_ECHOED_ID_CHARS,
  isDomainTag,
  type DomainTag,
  type NotFoundEntity,
  type DomainTagCode,
} from "../infra/tagged-errors";
export { toDomainTag } from "../infra/vendor-errors";
