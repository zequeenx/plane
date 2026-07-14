/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Meta, StoryObj } from "@storybook/react";
import { GripVertical } from "lucide-react";
import React from "react";
import { Sortable } from "./sortable";

type StoryItem = { id: string; name: string };

const meta: Meta<typeof Sortable<StoryItem>> = {
  title: "Sortable",
  component: Sortable,
  args: {
    data: [
      { id: "1", name: "John Doe" },
      { id: "2", name: "Satish" },
      { id: "3", name: "Alice" },
      { id: "4", name: "Bob" },
      { id: "5", name: "Charlie" },
    ],
    render: (item: StoryItem) => (
      // <Draggable data={item} className="rounded-lg">
      <div className="border">{item.name}</div>
      // </Draggable>
    ),
    onChange: (data) => console.log(data.map(({ id }) => id)),
    keyExtractor: (item) => item.id,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const HorizontalWrapping: Story = {
  render: function HorizontalWrappingStory() {
    const [items, setItems] = React.useState([
      { id: "state", name: "State" },
      { id: "priority", name: "Priority" },
      { id: "assignee", name: "Assignee" },
      { id: "customer-tier", name: "Customer tier" },
    ]);

    return (
      <div className="flex w-72 flex-wrap gap-2">
        <Sortable
          data={items}
          id="horizontal-wrapping"
          orientation="horizontal"
          keyExtractor={(item) => item.id}
          onChange={setItems}
          containerClassName="relative"
          render={(item, _index, { dragHandleRef }) => (
            <div className="flex items-center rounded-sm border border-subtle px-2 py-1 text-11">
              <button
                ref={dragHandleRef}
                type="button"
                aria-label={`Reorder ${item.name}`}
                className="cursor-grab text-placeholder active:cursor-grabbing"
              >
                <GripVertical className="size-3.5" />
              </button>
              <span className="ml-1">{item.name}</span>
            </div>
          )}
        />
      </div>
    );
  },
};
