/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

const mutationTails = new Map<string, Promise<void>>();

export const reconcileCustomFieldMutationValues = <TValue>(
  currentValues: Partial<Record<string, TValue>> | undefined,
  responseValues: Partial<Record<string, TValue>> | undefined,
  submittedFieldIds: string[]
): Partial<Record<string, TValue>> => {
  const reconciledValues = { ...currentValues };

  submittedFieldIds.forEach((fieldId) => {
    if (responseValues && Object.prototype.hasOwnProperty.call(responseValues, fieldId))
      reconciledValues[fieldId] = responseValues[fieldId];
    else delete reconciledValues[fieldId];
  });

  return reconciledValues;
};

export const enqueueCustomFieldMutation = <T>(mutationKeys: string[], mutation: () => Promise<T>): Promise<T> => {
  const keys = [...new Set(mutationKeys)];
  const precedingMutations = keys.flatMap((key) => {
    const tail = mutationTails.get(key);
    return tail ? [tail] : [];
  });
  let settleTail!: () => void;
  const settledTail = new Promise<void>((resolve) => {
    settleTail = resolve;
  });

  keys.forEach((key) => mutationTails.set(key, settledTail));
  const operation = precedingMutations.length > 0 ? Promise.all(precedingMutations).then(mutation) : mutation();
  void operation.then(settleTail, settleTail);
  void settledTail.finally(() => {
    keys.forEach((key) => {
      if (mutationTails.get(key) === settledTail) mutationTails.delete(key);
    });
  });

  return operation;
};
