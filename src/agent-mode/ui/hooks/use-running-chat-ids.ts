import type { AgentSessionManager } from "@/agent-mode/session/agent-session-manager";
import { useManagerSetSnapshot } from "@/agent-mode/ui/hooks/use-manager-set-snapshot";

const getRunningSnapshot = (manager: AgentSessionManager): ReadonlySet<string> =>
  manager.getRunningChatIds();

/**
 * Reactive set of recent-list ids whose backend turn is currently running.
 * The manager re-notifies whenever a session's running membership flips, so
 * the landing rows can show/hide their spinner without polling.
 */
export function useRunningChatIds(manager: AgentSessionManager): ReadonlySet<string> {
  return useManagerSetSnapshot(manager, getRunningSnapshot);
}
