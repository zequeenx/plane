/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useRef, useState } from "react";
// plane imports
import type { TIssue } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { getModuleIdsWithFieldValues } from "@plane/utils";

type TConfirmAction = (deleteModuleFieldValuesConfirmed: boolean) => Promise<void> | void;

export const useModuleFieldValueDeletionConfirmation = () => {
  const [moduleIdsPendingRemoval, setModuleIdsPendingRemoval] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actionRef = useRef<TConfirmAction | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const resetConfirmation = useCallback(() => {
    actionRef.current = null;
    cancelRef.current = null;
    setModuleIdsPendingRemoval([]);
  }, []);

  const closeConfirmation = useCallback(() => {
    if (isSubmitting) return;

    cancelRef.current?.();
    resetConfirmation();
  }, [isSubmitting, resetConfirmation]);

  const confirmModuleRemoval = useCallback(
    async (issue: TIssue | undefined, moduleIds: string[], action: TConfirmAction) => {
      const moduleIdsWithValues = getModuleIdsWithFieldValues(issue?.module_field_values, moduleIds);

      if (moduleIdsWithValues.length === 0) {
        await action(false);
        return;
      }

      return new Promise<void>((resolve, reject) => {
        actionRef.current = async (deleteModuleFieldValuesConfirmed) => {
          try {
            await action(deleteModuleFieldValuesConfirmed);
            resolve();
          } catch (error) {
            reject(error);
            throw error;
          }
        };
        cancelRef.current = resolve;
        setModuleIdsPendingRemoval(moduleIdsWithValues);
      });
    },
    []
  );

  const confirmationModal = useMemo(() => {
    const hasMultipleModules = moduleIdsPendingRemoval.length > 1;

    return (
      <AlertModalCore
        isOpen={moduleIdsPendingRemoval.length > 0}
        handleClose={closeConfirmation}
        handleSubmit={async () => {
          if (!actionRef.current) return;

          setIsSubmitting(true);
          try {
            await actionRef.current(true);
            resetConfirmation();
          } finally {
            setIsSubmitting(false);
          }
        }}
        isSubmitting={isSubmitting}
        title={hasMultipleModules ? "Remove modules?" : "Remove module?"}
        content={
          hasMultipleModules
            ? "Removing these modules will delete their saved module field values from this work item."
            : "Removing this module will delete its saved module field values from this work item."
        }
        primaryButtonText={{
          loading: "Removing",
          default: "Remove",
        }}
      />
    );
  }, [closeConfirmation, isSubmitting, moduleIdsPendingRemoval, resetConfirmation]);

  return { confirmModuleRemoval, confirmationModal };
};
