/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Controller } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { EViewAccess } from "@plane/types";
import { CustomSelect } from "@plane/ui";
// helpers
import { VIEW_ACCESS_SPECIFIERS } from "@/helpers/views.helper";

type Props = {
  control: any;
  disabledAccesses?: EViewAccess[];
};

export function AccessController(props: Props) {
  const { control, disabledAccesses = [] } = props;
  // i18n
  const { t } = useTranslation();

  return (
    <Controller
      control={control}
      name="access"
      render={({ field: { value, onChange } }) => {
        const selectedAccess =
          VIEW_ACCESS_SPECIFIERS.find((option) => option.key === value) ?? VIEW_ACCESS_SPECIFIERS[0];
        const SelectedAccessIcon = selectedAccess.icon;

        return (
          <CustomSelect
            value={value}
            onChange={onChange}
            label={
              <span className="flex items-center gap-1.5">
                <SelectedAccessIcon className="h-3.5 w-3.5" />
                {t(selectedAccess.i18n_label)}
              </span>
            }
            buttonClassName="border-subtle"
            placement="bottom-start"
          >
            {VIEW_ACCESS_SPECIFIERS.filter((option) => !disabledAccesses.includes(option.key)).map((option) => {
              const AccessIcon = option.icon;

              return (
                <CustomSelect.Option key={option.key} value={option.key}>
                  <div className="flex items-center gap-2">
                    <AccessIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{t(option.i18n_label)}</span>
                  </div>
                </CustomSelect.Option>
              );
            })}
          </CustomSelect>
        );
      }}
    />
  );
}
