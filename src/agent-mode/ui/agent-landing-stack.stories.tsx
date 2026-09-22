import { AgentLandingStack } from "@/agent-mode/ui/agent-landing-stack";
import type { Meta, StoryObj } from "@/lib/story";
import React from "react";

type AgentLandingStackProps = React.ComponentProps<typeof AgentLandingStack>;

interface LandingStackCanvasProps {
  args: Partial<AgentLandingStackProps>;
}

function LandingStackCanvas({ args }: LandingStackCanvasProps) {
  return (
    <div className="tw-flex tw-size-full tw-flex-col tw-overflow-y-auto tw-px-2">
      <AgentLandingStack
        composer={args.composer ?? null}
        floating={args.floating}
        context={args.context}
        shelf={args.shelf}
      />
    </div>
  );
}

const meta = {
  title: "Agent Mode/Agent Landing Stack",
  component: AgentLandingStack,
  args: {
    composer: (
      <div className="tw-rounded-md tw-border tw-border-solid tw-border-border tw-bg-primary tw-p-4 tw-text-ui-small tw-text-normal">
        Ask Copilot...
      </div>
    ),
  },
  parameters: { gallery: { host: "leaf", layout: "fullscreen" } },
} satisfies Meta<AgentLandingStackProps>;
export default meta;

/** The landing composition exercises the bottom-anchored composer with no other slots. */
export const FullPreview: StoryObj<AgentLandingStackProps> = {
  render: (args) => <LandingStackCanvas args={args} />,
};

/** The project landing exercises the standalone Context body above the composer. */
export const ContextPreview: StoryObj<AgentLandingStackProps> = {
  render: (args) => (
    <LandingStackCanvas
      args={{
        ...args,
        context: (
          <div className="tw-px-2 tw-pb-1 tw-pt-3">
            <div className="tw-rounded-md tw-border tw-border-solid tw-border-border tw-bg-primary tw-p-4 tw-text-ui-small tw-text-normal">
              Project context...
            </div>
          </div>
        ),
      }}
    />
  ),
};
