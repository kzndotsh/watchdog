import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { createIdentifierFn } from "@/domains/entities/identifiers/identifiers.functions";
import { errMessage } from "@/lib/utils";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { tableComposerKeyDown } from "@/shared/ui/data-table";
import {
  HANDLE_REQUIRES_PLATFORM,
  isHandleWithoutPlatform,
} from "@/shared/ui/identifiers/identifier-cells";
import {
  identifierCreateCanSubmit,
  useIdentifierCreateForm,
} from "@/shared/ui/identifiers/identifier-composer";
import { normalizeIdentifierPlatform } from "@watchdog/schemas";

type IdentifierCreateValues = Parameters<
  Parameters<typeof useIdentifierCreateForm>[0]
>[0]["value"];

interface IdentifierComposerSubmitContext {
  caseId: string;
  queryClient: QueryClient;
  setComposing: Dispatch<SetStateAction<boolean>>;
  setSubmitError: Dispatch<SetStateAction<string | null>>;
  createIdentifier: (value: IdentifierCreateValues) => Promise<unknown>;
}

async function submitIdentifierCreate(
  ctx: IdentifierComposerSubmitContext,
  value: IdentifierCreateValues
): Promise<void> {
  await ctx.createIdentifier(value);
  toast.success("Identifier added");
  await invalidateAfterEntityChanged(ctx.queryClient, ctx.caseId, {
    entityId: value.entityId,
  });
}

async function handleIdentifierCreateSubmit(
  ctx: IdentifierComposerSubmitContext,
  value: IdentifierCreateValues,
  reset: () => void
): Promise<void> {
  if (!identifierCreateCanSubmit(value, { requireEntity: true })) {
    if (isHandleWithoutPlatform(value.type, value.platform)) {
      ctx.setSubmitError(HANDLE_REQUIRES_PLATFORM);
    }
    return;
  }
  ctx.setSubmitError(null);
  try {
    await submitIdentifierCreate(ctx, value);
    reset();
    ctx.setComposing(false);
  } catch (error) {
    ctx.setSubmitError(errMessage(error, "Failed to add"));
  }
}

function identifierCreateOnSubmit(ctx: IdentifierComposerSubmitContext) {
  return async ({
    value,
    reset,
  }: {
    value: IdentifierCreateValues;
    reset: () => void;
  }) => handleIdentifierCreateSubmit(ctx, value, reset);
}

function buildIdentifierComposerControls(
  createForm: {
    reset: () => void;
    handleSubmit: () => Promise<void> | void;
    state: { isSubmitting: boolean; values: IdentifierCreateValues };
  },
  setSubmitError: Dispatch<SetStateAction<string | null>>,
  setComposing: Dispatch<SetStateAction<boolean>>
) {
  const closeComposer = () => {
    createForm.reset();
    setComposing(false);
  };

  const openComposer = () => {
    createForm.reset();
    setSubmitError(null);
    setComposing(true);
  };

  const submitCreate = () => {
    void createForm.handleSubmit();
  };

  const onComposerKey = (e: React.KeyboardEvent) => {
    tableComposerKeyDown({
      busy: createForm.state.isSubmitting,
      canSubmit: identifierCreateCanSubmit(createForm.state.values, {
        requireEntity: true,
      }),
      onSubmit: submitCreate,
      onCancel: closeComposer,
    })(e);
  };

  return { closeComposer, openComposer, submitCreate, onComposerKey };
}

export function useIdentifiersTableComposer(
  caseId: string,
  queryClient: QueryClient
) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (value: IdentifierCreateValues) => {
      const platform = normalizeIdentifierPlatform(value.platform);
      return createIdentifierFn({
        data: {
          caseId,
          entityId: value.entityId,
          type: value.type,
          value: value.value.trim(),
          platform: platform || undefined,
          status: value.status,
          confidence: value.confidence,
          evidenceIds: value.evidenceIds,
        },
      });
    },
  });

  const submitContext: IdentifierComposerSubmitContext = {
    caseId,
    queryClient,
    setComposing,
    setSubmitError,
    createIdentifier: (value) => createMutation.mutateAsync(value),
  };

  const createForm = useIdentifierCreateForm(
    identifierCreateOnSubmit(submitContext)
  );

  const controls = buildIdentifierComposerControls(
    createForm,
    setSubmitError,
    setComposing
  );

  return {
    createForm,
    submitError,
    composing,
    ...controls,
  };
}
