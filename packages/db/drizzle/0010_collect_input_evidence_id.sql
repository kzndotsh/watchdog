-- Custom migration (#574): the Evidence id a Job names in its input, as Collect's queue reads it.
-- It comes before the generated migration that indexes `jobs` on it, because an expression index
-- needs its function to exist.
--
-- It mirrors the queue builder's `parseTrimmedUuid(value)` followed by a comparison with a stored
-- (lowercase) Evidence id: JavaScript's `String.prototype.trim` whitespace, then zod 4's `z.uuid()`
-- form, lowercase only, because an uppercase input id never equals a stored id in the builder
-- either. Total: a non-string, junk, padding the builder would not trim, or a missing key gives
-- NULL, never an error, so a bad Cap input can never fail the transaction that flushes the queue.
-- IMMUTABLE (an index expression), with the pinned `search_path` of every function here.
CREATE FUNCTION public.collect_input_evidence_id(p_input jsonb, p_key text) RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN s.t ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
    THEN s.t::uuid
  END
  FROM (
    SELECT pg_catalog.regexp_replace(
      p_input ->> p_key,
      '^[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+|[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$',
      '',
      'g'
    ) AS t
    WHERE pg_catalog.jsonb_typeof(p_input -> p_key) = 'string'
  ) s
$$;
