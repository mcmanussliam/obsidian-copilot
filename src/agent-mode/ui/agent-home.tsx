import { useChatRelevantNotesContext } from "@/agent-mode/ui/hooks/use-chat-relevant-notes-context";
import AgentChatMessages from "@/agent-mode/ui/agent-chat-messages";
import { AgentChatControls } from "@/agent-mode/ui/agent-chat-controls";
import { AgentChatInput } from "@/agent-mode/ui/agent-chat-input";
import AgentContextMeter from "@/agent-mode/ui/agent-context-meter";
import AgentContextSection, { buildContextSummary } from "@/agent-mode/ui/agent-context-section";
import AgentContextStatusIcon from "@/agent-mode/ui/agent-context-status-icon";
import { AgentLandingStack } from "@/agent-mode/ui/agent-landing-stack";
import { CreateProjectPanel } from "@/agent-mode/ui/create-project-panel";
import { AgentModeStatus } from "@/agent-mode/ui/agent-mode-status";
import { AgentProjectHeader } from "@/agent-mode/ui/agent-project-header";
import { ProjectInfoPopover } from "@/agent-mode/ui/project-info-popover";
import { AgentTabStrip } from "@/agent-mode/ui/agent-tab-strip";
import { AgentWelcomeCard } from "@/agent-mode/ui/agent-welcome-card";
import { AgentHomeReleaseUpdate } from "@/components/release-update/agent-home-release-update";
import { useAgentChatRuntimeState } from "@/agent-mode/ui/hooks/use-agent-chat-runtime-state";
import { useAgentHistoryControls } from "@/agent-mode/ui/hooks/use-agent-history-controls";
import type { AgentInputDraftControls } from "@/agent-mode/ui/hooks/use-agent-input-drafts";
import { useChatInputAutoFocus } from "@/agent-mode/ui/hooks/use-chat-input-auto-focus";
import { useRefreshEmptyLandingOnContextSourceChange } from "@/agent-mode/ui/hooks/use-refresh-empty-landing-on-context-source-change";
import { useAgentModelPicker } from "@/agent-mode/ui/use-agent-model-picker";
import { useAgentModePicker } from "@/agent-mode/ui/use-agent-mode-picker";
import { useSessionBackendDescriptor } from "@/agent-mode/ui/use-backend-descriptor";
import type { AgentChatBackend } from "@/agent-mode/session/agent-chat-backend";
import type { AgentSessionManager } from "@/agent-mode/session/agent-session-manager";
import { GLOBAL_SCOPE } from "@/agent-mode/session/scope";
import { agentProjectContextLoadAtom } from "@/ai-params";
import { makeNewProjectConfig } from "@/agent-mode/ui/agent-project-create-form";
import { ContextManageModal } from "@/components/modals/project/context-manage-modal";
import { EVENT_NAMES } from "@/constants";
import { AppContext, ChatViewEventTarget, EventTargetContext } from "@/context";
import { ChatInputProvider, useChatInput } from "@/context/chat-input-context";
import { useChatFileDrop } from "@/hooks/use-chat-file-drop";
import { cn } from "@/lib/utils";
import { logError } from "@/logger";
import type CopilotPlugin from "@/main";
import { ProjectFileManager } from "@/projects/project-file-manager";
import { getProjectLandingCaptureSignature } from "@/projects/project-context-signature";
import { getCachedProjectRecordById, useProjects } from "@/projects/state";
import { getSettings, settingsStore, updateSetting, useSettingsValue } from "@/settings/model";
import { useAtomValue } from "jotai";
import { Notice } from "obsidian";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

interface AgentHomeProps {
  backend: AgentChatBackend;
  /** Active runtime session id. */
  sessionId: string;
  /** Logical identity of the active chat input surface. */
  chatInputId: string;
  /**
   * Compose draft for `chatInputId`. Owned by `AgentModeChat` because this
   * component unmounts whenever there is no active session, which a backend
   * restart causes mid-replacement.
   * https://github.com/Brevilabs/obsidian-copilot-private/issues/473
   */
  draft: AgentInputDraftControls;
  manager: AgentSessionManager;
  plugin: CopilotPlugin;
  onSaveChat: (saveAsNote: () => Promise<void>) => void;
  updateUserMessageHistory: (newMessage: string) => void;
}

/**
 * Agent Mode home surface for an active session. Persistent across tab switches
 * (the tab strip swaps `sessionId`/`backend` props), so switching tabs swaps the
 * active draft rather than discarding input. The draft store itself lives in
 * `AgentModeChat`, which outlives this component's no-session gaps.
 *
 * Derives a per-session view state across three surfaces: a session with no
 * user-visible messages is a landing — global (no project scope: bottom-anchored
 * composer) or per-project (the project's Context body over the bottom-anchored
 * composer); once it has messages it's the conversation. The global
 * and project landings share `AgentLandingStack`. The project header mounts over
 * both the project landing and the in-project conversation. (The no-session
 * fallback is handled upstream in `AgentModeChat`.) The `data-agent-landing`
 * attribute ("global" | "project" | "conversation") marks the seam.
 */
const AgentHomeInternal: React.FC<AgentHomeProps> = ({
  backend,
  sessionId,
  chatInputId,
  draft,
  manager,
  plugin,
  onSaveChat,
  updateUserMessageHistory,
}) => {
  const appContext = useContext(AppContext);
  const app = plugin.app || appContext;
  const settings = useSettingsValue();
  const eventTarget = useContext(EventTargetContext);
  const chatInput = useChatInput();

  // Place the caret in the composer when the agent view opens so the user can
  // type immediately. AgentHome only mounts once preload settles and a session
  // exists, so this fires when the input actually appears (and again on
  // close/reopen, which remounts this tree).
  useChatInputAutoFocus();

  // Insert text routed from outside the chat (e.g. the Relevant Notes pane's
  // "Add to Chat") into the active session's composer. The bus latches text
  // queued before this listener attaches, so a freshly-opened view still
  // receives it on mount.
  useEffect(() => {
    const bus = eventTarget instanceof ChatViewEventTarget ? eventTarget : null;
    const handleInsertText = (e: Event) => {
      bus?.consumePendingInsertText();
      const text = (e as CustomEvent<{ text?: string }>).detail?.text;
      if (typeof text === "string") chatInput.insertTextWithPills(text, true);
    };
    eventTarget?.addEventListener(EVENT_NAMES.INSERT_TEXT_TO_CHAT, handleInsertText);
    const pending = bus?.consumePendingInsertText();
    if (typeof pending === "string") chatInput.insertTextWithPills(pending, true);
    return () => {
      eventTarget?.removeEventListener(EVENT_NAMES.INSERT_TEXT_TO_CHAT, handleInsertText);
    };
  }, [eventTarget, chatInput]);

  const {
    messages,
    isStarting,
    hasPendingPlanPermission,
    currentPlan,
    currentTodoList,
    pendingToolPermissions,
    pendingAskUserQuestions,
  } = useAgentChatRuntimeState(backend);

  // Whole-surface root — the portal container for header-anchored overlays
  // (the project-info popover), which live OUTSIDE chatContainerRef. Held in
  // state (not a plain ref) so the popover re-renders once the node mounts and
  // actually receives the container instead of the first-render `null`.
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // External callers (CopilotPlugin.autosaveCurrentChat → CopilotAgentView.saveChat)
  // already gate on `settings.autosaveChat`, so this handler is the autosave-on
  // path — silent on success. The manual Save button uses `handleSaveAsNote`
  // below, which surfaces a Notice on completion.
  useEffect(() => {
    onSaveChat(async () => {
      await manager.saveActiveSession();
    });
  }, [onSaveChat, manager]);

  const handleSaveAsNote = useCallback(async () => {
    try {
      const result = await manager.saveActiveSession();
      if (result) {
        new Notice("Chat saved as note.");
      } else {
        new Notice("Nothing to save yet.");
      }
    } catch (error) {
      logError("[AgentMode] manual save failed", error);
      new Notice("Failed to save chat as note. Check console for details.");
    }
  }, [manager]);

  const handleNewChat = useCallback(() => {
    if (manager.getIsStarting()) return;
    const active = manager.getActiveSession();
    // Already on a fresh session — no-op so the user doesn't churn ACP
    // sessions just by clicking the button repeatedly.
    if (!active || !active.hasUserVisibleMessages()) return;
    const oldId = active.internalId;
    void (async () => {
      try {
        // Replace the current tab in place: same backend, same tab-strip
        // position. createSession + closeSession would append the new
        // session at the end and shift focus away from the user's slot.
        await manager.replaceSessionInPlace(oldId, active.backendId);
      } catch (e) {
        logError("[AgentMode] new chat failed", e);
        new Notice("Failed to start a new chat. Please try again.");
      }
    })();
    // A New Chat replacement gets a fresh chat input, so its draft and
    // input-scoped context reset without an explicit clear here.
  }, [manager]);

  const descriptor = useSessionBackendDescriptor(manager);
  const handleInstall = useCallback(() => {
    descriptor.openInstallUI(plugin);
  }, [descriptor, plugin]);

  const projects = useProjects();

  // Active scope drives the third (per-project) landing state and scopes the
  // history list. `GLOBAL_SCOPE` is the implicit global workspace. Read fresh
  // each render: the manager re-renders this tree on scope switch, and
  // `useProjects()` re-renders it on project create/rename/delete — so the
  // derived name and orphan flag stay live.
  const activeProjectId = manager.getActiveProjectId();
  const isProjectScope = activeProjectId !== GLOBAL_SCOPE;
  const activeProject = isProjectScope ? projects.find((p) => p.id === activeProjectId) : undefined;
  // The scope still points at a project whose record is gone (folder/`project.md`
  // deleted while the user was inside it). Degrade rather than crash: the header
  // keeps only the `‹` escape hatch, the composer hard-disables, and a one-time Notice fires.
  const isOrphanedProject = isProjectScope && !activeProject;
  const projectName = activeProject?.name ?? "";
  // Latch the in-project header content so its exit collapse animates with the
  // project it's leaving: `projectName`/`isOrphanedProject` flip to their global
  // values the instant the scope changes, before the header's collapse finishes,
  // which would otherwise flash an empty name mid-animation. Writing the ref
  // during render is the same derive-from-props pattern the context-load card uses.
  const lastProjectHeaderRef = useRef({
    name: projectName,
    orphaned: isOrphanedProject,
  });
  if (isProjectScope) {
    lastProjectHeaderRef.current = {
      name: projectName,
      orphaned: isOrphanedProject,
    };
  }
  const headerName = isProjectScope ? projectName : lastProjectHeaderRef.current.name;
  const headerOrphaned = isProjectScope ? isOrphanedProject : lastProjectHeaderRef.current.orphaned;

  // Scope the history list to the active project (project id) or the flat
  // all-chats view (`GLOBAL_SCOPE`). One wiring fixes the conversation-state
  // History popover, which shares this hook.
  const {
    chatHistoryItems,
    loadChatHistory: handleLoadChatHistory,
    loadChat: handleLoadChat,
    updateChatTitle: handleUpdateChatTitle,
    deleteChat: handleDeleteChat,
    openSourceFile: handleOpenSourceFile,
  } = useAgentHistoryControls(manager, plugin, activeProjectId);

  // Blocking signal for the composer's send-gate: true while the active
  // project's context is still materializing. Read-only here — the materializer
  // owns writes to this atom.
  const contextLoadStates = useAtomValue(agentProjectContextLoadAtom, { store: settingsStore });
  const contextLoadBlocking =
    isProjectScope && (contextLoadStates[activeProjectId]?.blocking ?? false);

  // Leave the project scope, returning to the global workspace.
  const handleExitProject = useCallback(() => {
    manager.exitProject().catch((e) => {
      logError("[AgentMode] exit project failed", e);
      new Notice("Failed to leave project. Please try again.");
    });
  }, [manager]);

  // Name-only create: the modal assembles a full ProjectConfig; we persist it
  // and drop straight into its landing. Rethrow on failure so the modal stays
  // open instead of closing on a write that didn't land.
  // Open the anchored name-only create panel next to the Welcome card button,
  // so it appears beside the trigger instead of dead-center like the full
  // edit modal.
  const [createAnchor, setCreateAnchor] = useState<HTMLElement | null>(null);
  const handleCreateProject = useCallback((anchorEl: HTMLElement) => {
    setCreateAnchor(anchorEl);
  }, []);

  // Persist a name-only project then enter it. A reject (e.g. a duplicate name)
  // bubbles to the panel's form, which shows a Notice and keeps the panel open.
  const persistCreateProject = useCallback(
    async ({ name }: { name: string }) => {
      const project = makeNewProjectConfig(name);
      try {
        await ProjectFileManager.getInstance(app).createProject(project);
        await manager.enterProject(project.id);
      } catch (e) {
        logError("[AgentMode] create project failed", e);
        throw e;
      }
      setCreateAnchor(null);
    },
    [app, manager]
  );

  // Persist the global-landing Welcome card's dismissal. `updateSetting` replaces
  // the whole `agentMode` object, so spread the freshest copy first.
  const handleDismissWelcome = useCallback(() => {
    updateSetting("agentMode", { ...getSettings().agentMode, welcomeDismissed: true });
  }, []);

  // Surface the orphaned-scope condition once when it appears (project deleted
  // out from under the active session). The header + disabled composer let the
  // user back out via the `‹` escape hatch.
  useEffect(() => {
    if (isOrphanedProject) new Notice("This project no longer exists.");
  }, [isOrphanedProject]);

  const modelPickerOverride = useAgentModelPicker(manager, plugin);
  const modePickerOverride = useAgentModePicker(manager);

  const handleCycleMode = useCallback(() => {
    if (!modePickerOverride || modePickerOverride.disabled) return;
    const { options, value, onChange } = modePickerOverride;
    if (options.length === 0) return;
    const currentIdx = options.findIndex((o) => o.value === value);
    const next = options[(currentIdx + 1) % options.length];
    if (next.value !== value) onChange(next.value);
  }, [modePickerOverride]);

  const setDraftInput = draft.setInput;
  useChatRelevantNotesContext(app, rootEl, chatInputId, draft, messages, activeProject);

  // https://github.com/Brevilabs/obsidian-copilot-private/issues/166
  // The manager binds a handoff draft to the new chat input before publishing
  // that session. Consume it only after this input is live so the text cannot
  // race into whichever composer was active before the session switch.
  useEffect(() => {
    const initialDraft = manager.consumeInitialDraft(chatInputId);
    if (initialDraft !== undefined) setDraftInput(initialDraft);
  }, [chatInputId, manager, setDraftInput]);

  // Whole chat area is the drop zone (bound to chatContainerRef), so files
  // dropped anywhere — not just on the composer — attach to the active draft.
  const { isDragActive } = useChatFileDrop({
    app,
    contextNotes: draft.contextNotes,
    setContextNotes: draft.setContextNotes,
    selectedImages: draft.images,
    onAddImage: draft.addImages,
    containerRef: chatContainerRef,
  });

  // Three surfaces, derived per render (the runtime subscription re-renders as
  // the stream updates, so the message-count read re-derives in step): a session
  // with no user-visible messages is a landing — global (no project scope) or
  // per-project — and once its first message lands it becomes the conversation.
  const isLanding = !manager.getActiveSession()?.hasUserVisibleMessages();
  const isProjectLanding = isLanding && isProjectScope;

  // A session captures its `<project_context>` block + searchable roots once, at
  // start (AgentSession.initialize awaiting `contextReady`). So after a Retry /
  // Edit re-materializes, a still-empty landing session would otherwise keep the
  // STALE inline block until a new chat. Replace it in place (the handleNewChat
  // pattern) so its fresh `initialize()` re-captures the new context — createSession
  // joins the just-started materialization (single-flight by project) on Retry, or
  // re-materializes the updated config on Edit. Guarded on an EMPTY draft so a
  // refresh never interrupts a draft already in progress. The replacement keeps
  // the logical chat input, so text typed during async startup stays attached.
  // Returns whether a swap actually happened (false = guarded no-op), so the
  // context-source observer advances its baseline only on a real capture.
  const refreshContextForEmptyLanding = useCallback(async (): Promise<boolean> => {
    const active = manager.getActiveSession();
    if (!active || active.hasUserVisibleMessages()) return false;
    const draftEmpty =
      draft.input.trim() === "" &&
      draft.images.length === 0 &&
      draft.contextNotes.length === 0 &&
      draft.queue.length === 0;
    if (!draftEmpty) return false;
    try {
      await manager.replaceSessionInPlace(active.internalId, active.backendId, {
        preserveChatInput: true,
      });
      return true;
    } catch (e) {
      logError("[AgentMode] refresh landing context failed", e);
      return false;
    }
  }, [manager, draft]);

  // Reactively refresh the empty landing when the active project's context
  // sources change underneath it (drag-drop / inline edit / +URL / chip removal
  // / Manage modal all funnel through the project store, which re-renders here).
  // The status icon's Retry keeps its own direct refresh — it re-captures from
  // the cache WITHOUT a project-store write, so this observer never sees it.
  const draftIsEmpty =
    draft.input.trim() === "" &&
    draft.images.length === 0 &&
    draft.contextNotes.length === 0 &&
    draft.queue.length === 0;
  // Fingerprint of what an empty landing session captures at creation: the
  // materialization signature PLUS the project instructions. Deliberately
  // broader than the session manager's materialization dirty-tracking signature,
  // because a landing also bakes in the project's AGENTS.md — so an
  // instruction-only edit must refresh it. Read from the live record;
  // `projects` is a deliberate re-derive trigger — not read inside the factory,
  // but a `useProjects()` change means the cached record may have changed.
  const activeProjectLandingCaptureSignature = useMemo(() => {
    if (!isProjectScope) return null;
    const record = getCachedProjectRecordById(activeProjectId);
    return record ? getProjectLandingCaptureSignature(app, record) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projects intentionally re-derives metadata read through the project cache
  }, [app, isProjectScope, activeProjectId, projects]);
  useRefreshEmptyLandingOnContextSourceChange({
    activeProjectId,
    signature: activeProjectLandingCaptureSignature,
    isLanding,
    blocking: contextLoadBlocking,
    draftEmpty: draftIsEmpty,
    refresh: refreshContextForEmptyLanding,
  });

  // Context summary for the composer's status icon (whether the project has
  // configured context sources). Pure derivation from the cached record, so
  // edits/drops keep it live.
  const contextSummary = useMemo(() => buildContextSummary(activeProject), [activeProject]);

  // The session's main agent — the multi-answer summarizer and dedup anchor for
  // `@`-mentions. The composer belongs to the ACTIVE session, so anchor to its
  // backend whenever one exists; fall back to the starting backend only for the
  // initial no-session startup. (Preferring the starting backend would mis-anchor
  // mentions to a backend cold-starting in another tab — e.g. `@opencode` from a
  // visible Claude chat would collapse to the degenerate single-agent path.)
  const mainAgentId =
    manager.getActiveSession()?.backendId ?? manager.getStartingBackendId() ?? null;

  // One composer element, shared by both surfaces. The project-scope props
  // drive the send-gate: `activeProjectId` + `contextLoadBlocking` make a send
  // queue-and-hold while context materializes; `disabled` hard-stops sends when
  // the active project is orphaned.
  // Project-context status icon for the composer's badge row. Only a real
  // (non-orphaned) project scope has context to report; global + orphaned omit it.
  // `onEditContext` opens the Manage Context modal (the same link/file/tag
  // manager as the Context section's Manage button), so the status popover edits
  // context sources directly rather than detouring through the full Edit Project
  // form. `onReindex` forces a re-materialization past the failure cache and
  // calls `refreshContextForEmptyLanding` directly (it re-captures from the
  // cache without a project-store write, so the source observer never sees it).
  // `onEditContext`'s save, by contrast, writes the project store and lets the
  // observer refresh the landing — so it must NOT also refresh directly.
  const openProjectManageModal = () => {
    if (!activeProject) return;
    new ContextManageModal(
      app,
      (updated) => {
        // The save writes through the project store, which the landing's
        // context-source observer ({@link useRefreshEmptyLandingOnContextSourceChange})
        // watches — so it refreshes the empty landing on its own. No direct
        // refresh here, or the store update and this call would each fire a
        // replaceSessionInPlace (double refresh).
        void ProjectFileManager.getInstance(app)
          .updateProject(activeProjectId, updated)
          .catch((err) => logError("[AgentMode] save context changes failed", err));
      },
      activeProject
    ).open();
  };

  const contextStatusIndicator =
    isProjectScope && !isOrphanedProject && activeProject ? (
      <AgentContextStatusIcon
        app={app}
        activeProjectId={activeProjectId}
        project={activeProject}
        hasConfiguredContextSource={!contextSummary.isEmpty}
        landing={isLanding}
        onReindex={() => manager.rematerializeContext(activeProjectId)}
        onRetryItem={(item) =>
          manager
            .rematerializeSource(activeProjectId, {
              kind: item.cacheKind,
              source: item.id,
            })
            .catch((e) => {
              logError("[AgentMode] retry source failed", e);
              return false;
            })
        }
        // The status icon defers this to popover-close so a retry's completion
        // can't swap the session and yank the popover shut mid-inspection.
        onRefreshLanding={refreshContextForEmptyLanding}
        onEditContext={openProjectManageModal}
      />
    ) : undefined;

  const composerNode = (
    <AgentChatInput
      backend={backend}
      plugin={plugin}
      chatInputId={chatInputId}
      draft={draft}
      app={app}
      mainAgentId={mainAgentId}
      updateUserMessageHistory={updateUserMessageHistory}
      isStarting={isStarting}
      hasPendingPlanPermission={hasPendingPlanPermission}
      modelPickerOverride={modelPickerOverride ?? undefined}
      modePickerOverride={modePickerOverride ?? undefined}
      onCycleMode={handleCycleMode}
      activeProjectId={activeProjectId}
      contextLoadBlocking={contextLoadBlocking}
      disabled={isOrphanedProject}
      contextStatusIndicator={contextStatusIndicator}
    />
  );

  return (
    <div ref={setRootEl} className="tw-flex tw-size-full tw-flex-col tw-overflow-hidden">
      {/* Project header sits ABOVE the tab strip: a project scope is just the
          global layout (tab strip → landing/conversation) with the project
          header prepended on top. It spans BOTH the project landing and the
          in-project conversation so sending the first message never drops the
          project scope from view.

          It animates open/closed on scope change instead of popping: the grid
          row transitions 1fr↔0fr over an overflow-hidden child, so the header's
          auto height collapses smoothly and the tab strip + content below slide
          with it. Kept mounted (not conditionally rendered) so BOTH enter and
          exit animate; collapsed it's a 0-height, hidden, non-interactive row —
          visually identical to absent, so the global layout is unchanged. */}
      <div
        className={cn(
          "tw-grid tw-shrink-0 tw-transition-[grid-template-rows,opacity] tw-duration-200 tw-ease-out motion-reduce:tw-transition-none",
          isProjectScope
            ? "tw-grid-rows-[1fr] tw-opacity-100"
            : "tw-pointer-events-none tw-grid-rows-[0fr] tw-opacity-0"
        )}
        aria-hidden={!isProjectScope}
      >
        <div className="tw-min-h-0 tw-overflow-hidden">
          <AgentProjectHeader
            projectName={headerName}
            onExit={handleExitProject}
            orphaned={headerOrphaned}
            menu={
              activeProject ? (
                <ProjectInfoPopover
                  app={app}
                  project={activeProject}
                  todoList={currentTodoList}
                  // The header sits OUTSIDE chatContainerRef, so the popover
                  // portals into the AgentHome root for popout correctness.
                  container={rootEl}
                />
              ) : undefined
            }
          />
        </div>
      </div>
      <AgentTabStrip manager={manager} />
      {createAnchor && (
        <CreateProjectPanel
          anchorEl={createAnchor}
          onClose={() => setCreateAnchor(null)}
          onSave={persistCreateProject}
        />
      )}
      <div className="tw-min-h-0 tw-flex-1">
        <div ref={chatContainerRef} className="tw-flex tw-size-full tw-flex-col tw-overflow-hidden">
          <div className="tw-h-full">
            <div className="tw-relative tw-flex tw-h-full tw-flex-col">
              <AgentHomeReleaseUpdate
                currentVersion={plugin.manifest.version}
                visible={isLanding && !isProjectLanding}
              />
              {isDragActive && (
                // pointer-events-none: this is visual feedback only — if the
                // overlay caught events, every dragover after the first would
                // target it and inner drop zones (the project context section)
                // would become unreachable.
                <div className="tw-pointer-events-none tw-absolute tw-inset-0 tw-z-modal tw-flex tw-items-center tw-justify-center tw-rounded-md tw-border tw-border-dashed tw-bg-primary tw-opacity-80">
                  <span>Drop files here...</span>
                </div>
              )}
              {/* Two surfaces share this padded, scrollable column: a landing
                  (global or per-project, laid out by AgentLandingStack —
                  content over the bottom-anchored composer) and the conversation
                  (transcript + controls + bottom composer). The shared `tw-px-2`
                  keeps the composer border and context rows on one left/right edge,
                  so inner elements add no horizontal padding of their own.

                  The composer (`composerNode`) is the same element in both
                  branches but sits at different tree positions, so it remounts on
                  the landing→conversation flip. That flip only fires right after
                  a send (which already reset the draft) or on a chat load (which
                  changes `chatInputId` and remounts anyway); the per-chat-input draft
                  lives in AgentHome and survives. CAUTION: the flip happens
                  DURING the first turn, so the unmounting composer instance still
                  has an in-flight `runSend` — anything that turn must do on
                  completion (clearing `draft.loading`) MUST NOT be gated on the
                  composer still being mounted (see runSend's finally). */}
              <div
                className={
                  // Landing: overflow-y-auto, not hidden — on a pane too short
                  // to fit the stack the column scrolls instead of clipping
                  // content out of reach. Conversation: the transcript owns its
                  // own scroll, so this stays hidden.
                  isLanding
                    ? "tw-flex tw-size-full tw-flex-col tw-overflow-y-auto tw-px-2"
                    : "tw-flex tw-size-full tw-flex-col tw-overflow-hidden tw-px-2"
                }
                data-agent-landing={
                  isProjectLanding ? "project" : isLanding ? "global" : "conversation"
                }
              >
                <AgentModeStatus manager={manager} plugin={plugin} onInstallClick={handleInstall} />
                {isLanding ? (
                  <AgentLandingStack
                    composer={composerNode}
                    floating={
                      // Global landing with no projects yet → the dismissible
                      // Welcome card. (Project context status now lives on the
                      // composer's status icon, not a floating load card.)
                      !isProjectLanding &&
                      projects.length === 0 &&
                      !settings.agentMode.welcomeDismissed ? (
                        <AgentWelcomeCard
                          onCreate={handleCreateProject}
                          onDismiss={handleDismissWelcome}
                        />
                      ) : undefined
                    }
                    context={
                      // Project landing: the Context body standalone below the
                      // composer. Skipped for an orphaned id — the body renders
                      // null for an unknown project and the wrapper would leave
                      // a stray padded gap.
                      isProjectLanding && !isOrphanedProject ? (
                        <div className="tw-px-2 tw-pb-1 tw-pt-3">
                          <AgentContextSection
                            app={app}
                            projectId={activeProjectId}
                            popoverContainer={rootEl}
                          />
                        </div>
                      ) : undefined
                    }
                  />
                ) : (
                  <>
                    <AgentChatMessages
                      sourcePath={manager.getSessionSourcePath(sessionId)}
                      key={sessionId}
                      messages={messages}
                      app={app}
                      currentPlan={currentPlan}
                      pendingToolPermissions={pendingToolPermissions}
                      pendingAskUserQuestions={pendingAskUserQuestions}
                      chatBackend={backend}
                      isLoading={draft.loading}
                    />
                    <AgentChatControls
                      onNewChat={handleNewChat}
                      onSaveAsNote={handleSaveAsNote}
                      chatHistoryItems={chatHistoryItems}
                      onLoadHistory={handleLoadChatHistory}
                      onLoadChat={handleLoadChat}
                      onUpdateChatTitle={handleUpdateChatTitle}
                      onDeleteChat={handleDeleteChat}
                      onOpenSourceFile={handleOpenSourceFile}
                      usageMeter={<AgentContextMeter backend={backend} />}
                      showMultiAgentUpsell
                    />
                    <div className="tw-shrink-0 tw-pb-2 tw-pt-3">{composerNode}</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AgentHome: React.FC<AgentHomeProps> = (props) => {
  return (
    <ChatInputProvider>
      <AgentHomeInternal {...props} />
    </ChatInputProvider>
  );
};
