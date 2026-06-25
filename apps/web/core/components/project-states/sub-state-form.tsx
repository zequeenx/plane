/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useId, useState } from "react";
import { TwitterPicker } from "react-color";
import { Button } from "@plane/propel/button";
import type { ISubState } from "@plane/types";
import { Input, Popover } from "@plane/ui";

type TSubStateFormProps = {
  data: Partial<ISubState>;
  onSubmit: (formData: Partial<ISubState>) => Promise<void>;
  onCancel: () => void;
  buttonDisabled: boolean;
  buttonTitle: string;
};

const DEFAULT_SUB_STATE_COLOR = "#60646C";
const DEFAULT_SUB_STATE_SEQUENCE = 65535;

function ColorSwatch({ color }: { color?: string | null }) {
  return (
    <div
      className="group inline-flex h-5 w-5 items-center rounded-sm text-14 font-medium transition-all focus:outline-none"
      style={{
        backgroundColor: color ?? DEFAULT_SUB_STATE_COLOR,
      }}
    />
  );
}

export function SubStateForm(props: TSubStateFormProps) {
  const { data, onSubmit, onCancel, buttonDisabled, buttonTitle } = props;
  const formId = useId();
  // states
  const [formData, setFormData] = useState<Partial<ISubState> | undefined>(undefined);
  const [errors, setErrors] = useState<Partial<Record<keyof ISubState, string>> | undefined>(undefined);

  useEffect(() => {
    if (data && !formData) setFormData(data);
  }, [data, formData]);

  const handleFormData = <T extends keyof ISubState>(key: T, value: ISubState[T]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const formSubmit = async (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    event.preventDefault();

    const name = formData?.name?.trim() || undefined;
    if (!formData || !name) {
      setErrors({ name: "Name is required" });
      return;
    }

    const sequence = Number(formData.sequence ?? DEFAULT_SUB_STATE_SEQUENCE);

    try {
      await onSubmit({
        name,
        color: formData.color ?? DEFAULT_SUB_STATE_COLOR,
        icon: formData.icon ?? "",
        sequence: Number.isFinite(sequence) ? sequence : DEFAULT_SUB_STATE_SEQUENCE,
      });
    } catch (error) {
      console.error("error", error);
    }
  };

  return (
    <div className="relative flex space-x-2 rounded-sm bg-surface-1 p-3">
      <div className="mt-2 h-full flex-shrink-0">
        <Popover button={<ColorSwatch color={formData?.color} />} panelClassName="mt-4 -ml-3">
          <TwitterPicker
            color={formData?.color ?? DEFAULT_SUB_STATE_COLOR}
            onChange={(value) => handleFormData("color", value.hex)}
          />
        </Popover>
      </div>

      <div className="w-full space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] gap-2">
          <Input
            id={`${formId}-sub-state-name`}
            type="text"
            name="name"
            placeholder="Name"
            value={formData?.name}
            onChange={(e) => handleFormData("name", e.target.value)}
            hasError={(errors && Boolean(errors.name)) || false}
            className="w-full"
            maxLength={100}
          />
          <Input
            id={`${formId}-sub-state-icon`}
            type="text"
            name="icon"
            placeholder="Icon"
            value={formData?.icon ?? ""}
            onChange={(e) => handleFormData("icon", e.target.value)}
            className="w-full"
            maxLength={16}
          />
          <Input
            id={`${formId}-sub-state-sequence`}
            type="number"
            name="sequence"
            placeholder="Order"
            value={formData?.sequence}
            onChange={(e) => handleFormData("sequence", Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Button onClick={formSubmit} variant="primary" size="lg" disabled={buttonDisabled}>
            {buttonTitle}
          </Button>
          <Button type="button" variant="secondary" size="lg" disabled={buttonDisabled} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
