import React from "react";

interface AgentLandingStackProps {
  /**
   * The composer. Passed as a slot so the same `AgentChatInput` element the
   * conversation state renders can sit at the frozen landing position.
   */
  composer: React.ReactNode;
  /**
   * Welcome card (global landing) — floats above the composer.
   */
  floating?: React.ReactNode;
  /**
   * Standalone project Context body. Project landing only; sits below the
   * floating slot.
   */
  context?: React.ReactNode;
  /**
   * Optional lower slot below the context body. Omitted
   * on landings that render no lower content —
   * the wrapper (and its top padding) is skipped so no empty gap remains.
   */
  shelf?: React.ReactNode;
}

/**
 * Pure layout for the Agent Home landing — both the global and per-project
 * variants render through this so the mount order is frozen in one place:
 * `[floating] → [context] → shelf → composer`.
 *
 * Content is top-anchored while the composer pins to the bottom: a flex-1
 * spacer between the content slots and the composer absorbs the remaining
 * space, so a short landing reads like the conversation (input at the bottom)
 * and on a pane too short to fit the stack the parent column scrolls instead
 * of clipping content out of reach.
 *
 * Presentational only: the parent owns the scrolling/padded column wrapper and
 * feeds each slot.
 */
export function AgentLandingStack({
  composer,
  floating,
  context,
  shelf,
}: AgentLandingStackProps): React.ReactElement {
  return (
    <>
      {floating ? <div className="tw-shrink-0 tw-pt-2">{floating}</div> : null}
      {context ? <div className="tw-shrink-0">{context}</div> : null}
      {shelf ? (
        <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-pt-6">{shelf}</div>
      ) : null}
      <div className="tw-min-h-0 tw-flex-1 tw-shrink-0" />
      <div className="tw-shrink-0 tw-pb-2 tw-pt-3">{composer}</div>
    </>
  );
}
