import {
  CODEX_BINARY_NAME,
  codexBinaryPathPlaceholder,
} from "@/agent-mode/backends/codex/cli-setup";
import { CODEX_MIN_VERSION } from "@/agent-mode/backends/codex/codex-version";
import {
  ManagedBinaryConfigView,
  type ManagedBinaryConfigProps,
} from "@/agent-mode/backends/shared/ui/managed-binary-config-view";
import {
  AuthenticationSection,
  type AuthenticationState,
} from "@/agent-mode/backends/shared/ui/authentication-section";
import React from "react";

export type {
  ManagedBinarySource as CodexBinarySource,
  ManagedBinaryInfo as CodexManagedInfo,
  ManagedBinaryConfigActions as CodexConfigActions,
} from "@/agent-mode/backends/shared/ui/managed-binary-config-view";

export interface CodexConfigViewProps extends ManagedBinaryConfigProps {
  auth: AuthenticationState;
}

export const CodexConfigView: React.FC<CodexConfigViewProps> = (props) => (
  <ManagedBinaryConfigView
    authStatus={props.auth.status}
    {...props}
    title="Configure Codex"
    binaryName={CODEX_BINARY_NAME}
    managedDescription="Let Copilot download and manage Codex."
    customDescription={
      <>
        Copilot supports <code>@agentclientprotocol/codex-acp</code> {CODEX_MIN_VERSION} or newer.
        You manage its upgrades; Auto-detect checks the usual npm locations and your PATH.
      </>
    }
    customPathPlaceholder={codexBinaryPathPlaceholder(process.platform)}
    customPathNotFoundHint={`A supported ${CODEX_BINARY_NAME} adapter was not found. Install your own adapter or choose Managed by Copilot.`}
    upgradeLabel="Upgrade"
  >
    <AuthenticationSection
      ready={props.state.kind === "ready"}
      unavailableMessage="Set up a supported Codex adapter above to enable sign-in."
      auth={props.auth}
    />
  </ManagedBinaryConfigView>
);

export { CODEX_PINNED_VERSION } from "@/agent-mode/backends/codex/cli-setup";
