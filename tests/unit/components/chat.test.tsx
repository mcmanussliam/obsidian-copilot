import Chat from "@/components/chat";
import { USER_SENDER } from "@/constants";
import type { NoteSelectedTextContext } from "@/types/message";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

const mockSelection: NoteSelectedTextContext = {
  id: "excerpt",
  sourceType: "note",
  noteTitle: "Research",
  notePath: "Research.md",
  content: "Interview findings",
  startLine: 2,
  endLine: 2,
};
const mockSelections = [mockSelection];
const mockMessages = [{ id: "message-1", message: "Original question", sender: USER_SENDER }];

/* eslint-disable @eslint-react/hooks-extra/no-unnecessary-use-prefix */
jest.mock("@/ai-params", () => ({
  useModelKey: () => ["model", jest.fn()],
  useChainType: () => ["llm_chain"],
  useSelectedTextContexts: () => [mockSelections],
}));
jest.mock("@/settings/model", () => ({
  useSettingsValue: () => ({ autoAddActiveContentToContext: true }),
}));
jest.mock("@/hooks/use-chat-manager", () => ({
  useChatManager: () => ({ messages: mockMessages, addMessage: jest.fn() }),
}));
jest.mock("@/hooks/use-chat-file-drop", () => ({
  useChatFileDrop: () => ({ isDragActive: false }),
}));
jest.mock("@/components/chat-components/use-chat-model-picker", () => ({
  useChatModelPicker: () => ({ models: [] }),
}));
jest.mock("@/components/chat-components/hooks/use-active-web-tab-state", () => ({
  useActiveWebTabState: () => ({}),
}));
jest.mock("@/context/chat-input-context", () => ({
  ChatInputProvider: ({ children }: { children: React.ReactNode }) => children,
  useChatInput: () => ({}),
}));
/* eslint-enable @eslint-react/hooks-extra/no-unnecessary-use-prefix */
jest.mock("@/components/chat-components/chat-controls", () => ({ ChatControls: () => null }));
jest.mock("@/components/chat-components/ui/agent-mode-banner", () => ({
  AgentModeBanner: () => null,
}));
jest.mock("@/components/chat-components/chat-mode-input", () => ({
  __esModule: true,
  default: (props: {
    inputMessage: string;
    setInputMessage: (text: string) => void;
    handleSendMessage: () => void;
    setIncludeActiveNote: (include: boolean) => void;
  }) => (
    <>
      <input
        aria-label="Message"
        value={props.inputMessage}
        onChange={(event) => props.setInputMessage(event.target.value)}
      />
      <button type="button" onClick={() => props.handleSendMessage()}>
        Send
      </button>
      <button type="button" onClick={() => props.setIncludeActiveNote(false)}>
        Remove active note
      </button>
    </>
  ),
}));
jest.mock("@/components/chat-components/chat-messages", () => ({
  __esModule: true,
  isChatEmpty: () => false,
  default: ({ onEdit }: { onEdit: (index: number, text: string) => void }) => (
    <button type="button" onClick={() => onEdit(0, "Revised question")}>
      Edit message
    </button>
  ),
}));
jest.mock("@/system-prompts", () => ({}));
jest.mock("@/langchain-stream", () => ({}));
jest.mock("@/log-file-manager", () => ({ logFileManager: {} }));
jest.mock("@/llm-providers/chain-runner/utils/prompt-payload-recorder", () => ({}));
jest.mock("@/utils", () => ({ isPlusChain: () => false }));

function renderChat() {
  const chatUIState = {
    sendMessage: jest.fn().mockResolvedValue("message-2"),
    getLLMMessage: jest.fn().mockReturnValue(undefined),
    editMessage: jest.fn().mockResolvedValue(true),
    truncateAfterMessageId: jest.fn().mockResolvedValue(undefined),
  };
  const props = {
    chatUIState,
    chainManager: { chatModelManager: {} },
    fileParserManager: {},
    onSaveChat: jest.fn(),
    updateUserMessageHistory: jest.fn(),
    plugin: {
      app: {},
      chatSelectionHighlightController: { clearIfNoNoteContexts: jest.fn() },
    },
  } as unknown as React.ComponentProps<typeof Chat>;
  render(<Chat {...props} />);
  return chatUIState;
}

describe("Chat", () => {
  describe("handleSendMessage()", () => {
    it.each([true, false])(
      "preserves active-note inclusion %p when sending selected text https://github.com/Brevilabs/obsidian-copilot-private/issues/465",
      async (includeActiveNote) => {
        const chatUIState = renderChat();
        if (!includeActiveNote) fireEvent.click(screen.getByText("Remove active note"));
        fireEvent.change(screen.getByLabelText("Message"), {
          target: { value: "Compare findings" },
        });

        fireEvent.click(screen.getByText("Send"));

        await waitFor(() => expect(chatUIState.sendMessage).toHaveBeenCalledTimes(1));
        expect(chatUIState.sendMessage.mock.calls[0].slice(0, 4)).toEqual([
          "Compare findings",
          expect.objectContaining({ selectedTextContexts: [mockSelection] }),
          "llm_chain",
          includeActiveNote,
        ]);
      }
    );
  });

  describe("handleEdit()", () => {
    it.each([true, false])(
      "does not attach the current note when editing with composer inclusion %p https://github.com/Brevilabs/obsidian-copilot-private/issues/465",
      async (includeActiveNote) => {
        const chatUIState = renderChat();
        if (!includeActiveNote) fireEvent.click(screen.getByText("Remove active note"));

        fireEvent.click(screen.getByText("Edit message"));

        await waitFor(() =>
          expect(chatUIState.editMessage).toHaveBeenCalledWith(
            "message-1",
            "Revised question",
            "llm_chain",
            false
          )
        );
      }
    );
  });
});
