import { mockTFile } from "@tests/helpers/mock-obsidian";
import { act, renderHook } from "@testing-library/react";
import { useChatManager } from "@/hooks/use-chat-manager";
import { ChatManagerChatUIState } from "@/state/chat-ui-state";
import type { ChatManager } from "@/core/chat-manager";
import type { ChatMessage } from "@/types/message";
import type { TFile } from "obsidian";

jest.mock("@/core/chat-manager");

function fixture() {
  let sourcePath = "";
  const messages: ChatMessage[] = [];
  const manager = {
    setOnMessageCreatedCallback: jest.fn(),
    getDisplayMessages: () => messages,
    getSourcePath: () => sourcePath,
    saveChat: jest.fn(async () => {
      sourcePath = "chat/Saved.md";
    }),
    loadChatHistory: jest.fn(async (file: TFile) => {
      sourcePath = file.path;
    }),
    clearMessages: jest.fn(() => {
      sourcePath = "";
    }),
  };
  const state = new ChatManagerChatUIState(manager as unknown as ChatManager);
  return { state, manager };
}

describe("useChatManager", () => {
  describe("useChatManager()", () => {
    it("reactively publishes the first saved source, loaded conversation, and new-chat reset https://github.com/Brevilabs/obsidian-copilot-private/issues/539", async () => {
      const { state } = fixture();
      const { result } = renderHook(() => useChatManager(state));
      expect(result.current.sourcePath).toBe("");
      await act(async () => state.saveChat("model"));
      expect(result.current.sourcePath).toBe("chat/Saved.md");
      await act(async () => state.loadChatHistory(mockTFile({ path: "archive/Loaded.md" })));
      expect(result.current.sourcePath).toBe("archive/Loaded.md");
      act(() => result.current.clearMessages());
      expect(result.current.sourcePath).toBe("");
    });
  });
});
