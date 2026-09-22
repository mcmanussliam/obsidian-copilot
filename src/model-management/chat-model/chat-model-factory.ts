/**
 * Pure dispatch — given a `configuredModelId`, build a LangChain
 * `BaseChatModel`. The factory:
 *
 *   1. Looks up the `ConfiguredModel` row.
 *   2. Resolves the parent `Provider`.
 *   3. Fetches the API key from the keychain (via `ProviderRegistry`).
 *   4. Parses `Provider.extras` through the adapter's `extrasSchema`.
 *   5. Hands the resolved tuple to the adapter's
 *      `buildLangChainClient`.
 *
 * No state, no settings reads at the factory level — every dependency
 * is injected. This is what keeps `ChatModelFactory` independent of
 * LangChain imports (those live in the adapters) and easy to unit-test
 * with a small mock `ProviderAdapterRegistry`.
 */

import type { ConfiguredModel, Provider } from "@/model-management/types/persisted";
import type { BuiltChatModel } from "@/model-management/types/runtime";
import type { ConfiguredModelRegistry } from "@/model-management/models/configured-model-registry";
import type { ProviderAdapterRegistry } from "@/model-management/providers/adapters/provider-adapter-registry";
import type { ProviderRegistry } from "@/model-management/providers/provider-registry";

export class ChatModelFactory {
  constructor(
    providerRegistry: ProviderRegistry,
    configuredModelRegistry: ConfiguredModelRegistry,
    adapters: ProviderAdapterRegistry
  ) {}

  /**
   * Resolve a configured-model id → built client. Throws when the
   * configured model is missing, its parent provider is missing, or
   * the adapter rejects `extras`.
   */
  build(configuredModelId: string): Promise<BuiltChatModel> {
    throw new Error("[modelManagement] ChatModelFactory.build not implemented yet");
  }

  /**
   * Lower-level entry point for callers that already hold the rows
   * (the setup APIs' verification path, in particular).
   */
  buildFor(provider: Provider, configuredModel: ConfiguredModel): Promise<BuiltChatModel> {
    throw new Error("[modelManagement] ChatModelFactory.buildFor not implemented yet");
  }
}
