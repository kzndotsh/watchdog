export { errorMessage, isUniqueViolation } from "../infra/error-utils";
export {
  NotFoundError,
  ConflictError,
  InternalError,
  InvalidError,
  ForbiddenError,
  NOT_FOUND_ENTITIES,
  mapDomainCatch,
  isDomainTag,
  type DomainTag,
  type NotFoundEntity,
  type DomainTagCode,
} from "../infra/tagged-errors";
