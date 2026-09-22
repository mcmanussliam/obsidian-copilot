// Public surface of the model-management module. Host code must import
// from this barrel — deep imports of `@/model-management/types/*` and
// other internals are blocked by `no-restricted-imports` patterns in
// eslint.config.mjs.

// ---------------------------------------------------------------------------
// Data-model types
// ---------------------------------------------------------------------------

export type { CatalogProvider, ModelInfo, ProviderType } from "./types/catalog";
export type {
  AgentType,
  BackendConfig,
  BackendType,
  ConfiguredModel,
  PersistedCopilotPlusCatalog,
  Provider,
  ProviderOrigin,
} from "./types/persisted";
export type {
  BuiltChatModel,
  EnabledBackendEntry,
  ProviderDefinition,
  RefreshResult,
  VerificationResult,
} from "./types/runtime";

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export { CatalogDownloadService } from "./catalog/catalog-download-service";
export type { CatalogDownloadDeps, CatalogRefreshResult } from "./catalog/catalog-download-service";

export { ProviderRegistry } from "./providers/provider-registry";
export { isSelfHostedProvider, isSelfHostedUrl } from "./providers/is-self-hosted-provider";
export { providerNeedsSelfHostWarning } from "./providers/self-host-policy";
export type { SelfHostPolicyInput } from "./providers/self-host-policy";
export {
  providerNeedsResolvedApiKey,
  providerRequiresApiKey,
} from "./providers/provider-requires-api-key";
export { ConfiguredModelRegistry } from "./models/configured-model-registry";
export { BackendConfigRegistry } from "./backends/backend-config-registry";
export { ChatModelFactory } from "./chat-model/chat-model-factory";
export {
  configuredModelToCustomModel,
  mapProviderTypeToChatModelProvider,
} from "./chat-model/configured-model-to-custom-model";
export {
  findChatBackendEntry,
  isChatModelSelectionForEntry,
  resolveChatModelSelectionId,
} from "./chat-model/chat-model-selection";
export type { ResolvedChatBackendEntry } from "./chat-model/chat-model-selection";
export { resolveChatBackendModel } from "./chat-model/resolve-chat-backend-model";
export type { ChatBackendResolution } from "./chat-model/resolve-chat-backend-model";
export {
  capabilityListFromModelInfo,
  capabilitiesFromConfiguredInfo,
} from "./chat-model/model-capability-flags";

// ---------------------------------------------------------------------------
// Provider adapter contract
// ---------------------------------------------------------------------------

export {
  createDefaultAdapterRegistry,
  ProviderAdapterRegistry,
} from "./providers/adapters/provider-adapter-registry";
export type {
  AdapterBuildContext,
  AdapterVerifyContext,
  ProviderAdapter,
} from "./providers/adapters/provider-adapter";

// ---------------------------------------------------------------------------
// Setup APIs (one per ProviderOrigin.kind)
// ---------------------------------------------------------------------------

export { ByokSetupApi, BYOK_DEFAULT_AUTO_ENROLL } from "./setup/byok-setup-api";
export type { AddModelsInput, ByokSetupResult, SetupProviderInput } from "./setup/byok-setup-api";

export { AgentSetupApi } from "./setup/agent-setup-api";
export type {
  AgentSetupResult,
  AgentSyncResult,
  RegisterAgentProviderInput,
  SyncAgentModelsInput,
} from "./setup/agent-setup-api";

export { CopilotPlusSetupApi } from "./setup/copilot-plus-setup-api";
export type { PlusSetupResult, RegisterPlusProviderInput } from "./setup/copilot-plus-setup-api";
export { plusSyncNeeded, syncCopilotPlusProvider } from "./setup/copilot-plus-sync";
export type { CopilotPlusModelsFetcher } from "./setup/copilot-plus-sync";
export { readCopilotPlusCatalog, parseContextLength } from "./setup/copilot-plus-catalog";
export type { CopilotPlusCatalog } from "./setup/copilot-plus-catalog";

// ---------------------------------------------------------------------------
// Top-level factory + coordinator
// ---------------------------------------------------------------------------

export { createModelManagement, ModelManagementCoordinator } from "./create-model-management";
export type { CreateModelManagementInput, ModelManagementApi } from "./create-model-management";

// ---------------------------------------------------------------------------
// Reactive atoms (Jotai)
//
// React: `useAtomValue(<atom>, { store: settingsStore })`
// Non-React subscribers: `settingsStore.sub(<atom>, listener)`
// ---------------------------------------------------------------------------

export {
  agentProvidersAtom,
  backendPickerAtomFamily,
  backendsAtom,
  byokProvidersAtom,
  configuredModelsAtom,
  copilotPlusCatalogAtom,
  copilotPlusProvidersAtom,
  providersAtom,
  selfHostModeAtom,
  visibleByokProvidersAtom,
} from "./state/atoms";

// ---------------------------------------------------------------------------
// React context for mutation access (reads use atoms directly)
// ---------------------------------------------------------------------------

export { ModelManagementProvider, useModelManagement } from "./ui/model-management-context";

// ---------------------------------------------------------------------------
// Settings UI (BYOK tab)
// ---------------------------------------------------------------------------

export { ByokPanel } from "./ui/tabs/byok-panel";
