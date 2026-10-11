import type { ReactNode } from "react";

import type { TaskFormValues } from "@/domains/tasks/lib/task-form";

/** Minimal surface used by task dialog field/footer helpers. */
export type TaskDialogForm = {
  Field: (props: {
    name: keyof TaskFormValues;
    children: (field: {
      state: { value: TaskFormValues[keyof TaskFormValues] };
      handleBlur: () => void;
      handleChange: (value: TaskFormValues[keyof TaskFormValues]) => void;
    }) => ReactNode;
  }) => ReactNode;
  Subscribe: (props: {
    selector: (state: {
      canSubmit: boolean;
      isSubmitting: boolean;
    }) => readonly [boolean, boolean];
    children: ([canSubmit, isSubmitting]: readonly [
      boolean,
      boolean,
    ]) => ReactNode;
  }) => ReactNode;
  handleSubmit: () => void | Promise<void>;
  reset: (values?: TaskFormValues) => void;
};
