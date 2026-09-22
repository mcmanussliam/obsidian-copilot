import {
  $getSelection,
  $isRangeSelection,
  $createTextNode,
  LexicalNode,
  TextNode,
  createCommand,
  LexicalCommand,
} from "lexical";
import { TFile, TFolder, App } from "obsidian";
import type { WebTabContext } from "@/types/message";
import { $createNotePillNode } from "@/components/chat-components/pills/note-pill-node";
import { $createActiveNotePillNode } from "@/components/chat-components/pills/active-note-pill-node";
import { $createURLPillNode } from "@/components/chat-components/pills/url-pill-node";
import { $createToolPillNode } from "@/components/chat-components/pills/tool-pill-node";
import { $createFolderPillNode } from "@/components/chat-components/pills/folder-pill-node";
import { $createWebTabPillNode } from "@/components/chat-components/pills/web-tab-pill-node";
import { $createActiveWebTabPillNode } from "@/components/chat-components/pills/active-web-tab-pill-node";
import { $createAgentPillNode } from "@/components/chat-components/pills/agent-pill-node";
import { logInfo } from "@/logger";
import { AVAILABLE_TOOLS } from "@/components/chat-components/constants/tools";

export type PillType =
  | "notes"
  | "tools"
  | "folders"
  | "active-note"
  | "webTabs"
  | "activeWebTab"
  | "agents";

// Type representing different kinds of parsed content segments
export type ParsedContentType =
  | "text"
  | "note-pill"
  | "active-note-pill"
  | "url-pill"
  | "tool-pill"
  | "folder-pill";

// Type representing different pattern matching categories
export type PatternType = "notes" | "urls" | "tools" | "customTemplates";

// Type representing the data associated with a pill
export type PillDataValue = TFile | TFolder | string | WebTabContext;

export interface PillData {
  type: PillType;
  title?: string;
  data?: PillDataValue;
}

/**
 * Generic function to create pill nodes based on type and data
 */
function $createPillNode(pillData: PillData) {
  const { type, title, data } = pillData;

  switch (type) {
    case "active-note":
      // Active note pill doesn't need title or data - it automatically shows current active file
      return $createActiveNotePillNode();
    case "notes":
      if (data instanceof TFile && title) {
        return $createNotePillNode(title, data.path);
      }
      break;
    case "tools":
      if (typeof data === "string") {
        return $createToolPillNode(data);
      }
      break;
    case "folders":
      if (data instanceof TFolder) {
        return $createFolderPillNode(data.path);
      }
      break;
    case "webTabs":
      // WebTabContext has url, title, faviconUrl
      if (data && typeof data === "object" && "url" in data) {
        return $createWebTabPillNode(data.url, data.title, data.faviconUrl);
      }
      break;
    case "activeWebTab":
      return $createActiveWebTabPillNode();
    case "agents":
      if (typeof data === "string") {
        return $createAgentPillNode(data, title ?? data);
      }
      break;
  }

  throw new Error(`Invalid pill data: ${JSON.stringify(pillData)}`);
}

export interface ParsedContent {
  type: ParsedContentType;
  content: string;
  file?: TFile;
  url?: string;
  toolName?: string;
  tagName?: string;
  folder?: TFolder;
  isActive?: boolean;
}

export interface InsertTextOptions {
  enableURLPills?: boolean;
  enableToolPills?: boolean;
  enableCustomTemplatePills?: boolean;
  insertAtSelection?: boolean;
}

/**
 * Splits text at a given range into before and after segments
 * @param text The text to split
 * @param startOffset The start position
 * @param endOffset The end position
 * @returns Object with beforeText and afterText
 */
function splitTextAtRange(
  text: string,
  startOffset: number,
  endOffset: number
): { beforeText: string; afterText: string } {
  return {
    beforeText: text.slice(0, startOffset),
    afterText: text.slice(endOffset),
  };
}

/**
 * Inserts a pill node with optional space after, handling both replacement and insertion scenarios
 * @param anchorNode The anchor text node
 * @param beforeText Text that comes before the pill
 * @param pillNode The pill node to insert
 * @param afterText Text that comes after the pill
 * @param addSpace Whether to add a space after the pill
 */
function $insertPillWithOptionalSpace(
  anchorNode: TextNode,
  beforeText: string,
  pillNode: LexicalNode,
  afterText: string,
  addSpace: boolean
): void {
  // Calculate the space and after text combination
  const spaceAndAfter = addSpace ? (afterText ? " " + afterText : " ") : afterText;

  if (beforeText) {
    // Replace node content with before text, then insert pill and space+after
    anchorNode.setTextContent(beforeText);
    anchorNode.insertAfter(pillNode);
    if (spaceAndAfter) {
      pillNode.insertAfter($createTextNode(spaceAndAfter));
    }
  } else {
    // Replace entire node with pill, then add space+after
    anchorNode.replace(pillNode);
    if (spaceAndAfter) {
      pillNode.insertAfter($createTextNode(spaceAndAfter));
    }
  }

  // Set cursor after the pill (and space if added)
  pillNode.selectNext();
}

/**
 * Command for inserting text with automatic pill conversion from external sources
 */
export const INSERT_TEXT_WITH_PILLS_COMMAND: LexicalCommand<{
  text: string;
  options?: InsertTextOptions;
}> = createCommand("INSERT_TEXT_WITH_PILLS_COMMAND");

/**
 * Validates if a string is a valid URL
 * @param string The string to validate
 * @returns True if the string is a valid URL
 */
function isValidURL(string: string): boolean {
  try {
    const url = new URL(string);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Attempts to resolve a tool reference
 * @param toolName The name of the tool to resolve (with or without @)
 * @returns The tool name if valid, null otherwise
 */
function resolveToolReference(toolName: string): string | null {
  // Ensure the tool name has @ prefix
  const normalizedToolName = toolName.startsWith("@") ? toolName : `@${toolName}`;

  if (AVAILABLE_TOOLS.includes(normalizedToolName)) {
    return normalizedToolName;
  }

  return null;
}

/**
 * Attempts to resolve a folder reference to a TFolder
 * @param app The Obsidian `App` instance used for vault lookups
 * @param folderName The name of the folder to resolve
 * @returns TFolder if found, null otherwise
 */
function resolveFolderReference(app: App, folderName: string): TFolder | null {
  if (!app?.vault) {
    return null;
  }

  try {
    // Get all folders in the vault
    const allFolders = app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder);

    // First, try exact name match
    for (const folder of allFolders) {
      if (folder.name === folderName) {
        return folder;
      }
    }

    // Then, try path match for nested folders
    for (const folder of allFolders) {
      if (folder.path === folderName) {
        return folder;
      }
    }

    // Finally, try case-insensitive match
    const lowerFolderName = folderName.toLowerCase();
    for (const folder of allFolders) {
      if (
        folder.name.toLowerCase() === lowerFolderName ||
        folder.path.toLowerCase() === lowerFolderName
      ) {
        return folder;
      }
    }

    return null;
  } catch (error) {
    logInfo("Error resolving folder reference:", error);
    return null;
  }
}

/**
 * Attempts to resolve a note reference to a TFile
 * @param app The Obsidian `App` instance used for vault/metadata lookups
 * @param noteName The name of the note to resolve
 * @returns TFile if found, null otherwise
 */
function resolveNoteReference(app: App, noteName: string): TFile | null {
  if (!app?.vault || !app?.metadataCache) {
    return null;
  }

  try {
    // Try to resolve using Obsidian's link resolution
    const file = app.metadataCache.getFirstLinkpathDest(noteName, "");

    if (file && file instanceof TFile) {
      return file;
    }

    // Fallback: try with .md extension if not already present
    if (!noteName.endsWith(".md")) {
      const fileWithExt = app.metadataCache.getFirstLinkpathDest(noteName + ".md", "");
      if (fileWithExt && fileWithExt instanceof TFile) {
        return fileWithExt;
      }
    }

    // Fallback: try with .pdf extension if not already present
    if (!noteName.endsWith(".pdf")) {
      const pdfFile = app.metadataCache.getFirstLinkpathDest(noteName + ".pdf", "");
      if (pdfFile && pdfFile instanceof TFile) {
        return pdfFile;
      }
    }

    // Another fallback: search by basename in markdown files
    const markdownFiles = app.vault.getMarkdownFiles();
    for (const file of markdownFiles) {
      if (file.basename === noteName || file.name === noteName) {
        return file;
      }
    }

    // Final fallback: search by basename in PDF files
    const allFiles = app.vault.getFiles();
    const pdfFiles = allFiles.filter(
      (file): file is TFile => file instanceof TFile && file.extension === "pdf"
    );
    for (const file of pdfFiles) {
      if (file.basename === noteName || file.name === noteName) {
        return file;
      }
    }

    return null;
  } catch (error) {
    logInfo("Error resolving note reference:", error);
    return null;
  }
}

interface PatternInfo {
  type: PatternType;
  groupCount: number;
  startIndex: number;
}

/**
 * Parses text content to extract [[note name]], @tool, #tag patterns and optionally URLs, converting them to appropriate pills
 * @param app The Obsidian `App` instance used to resolve note/folder references
 * @param text The text content to parse
 * @param options Options for what types of pills to process
 * @returns Array of parsed content segments with type information
 */
export function parseTextForPills(
  app: App,
  text: string,
  options: {
    includeNotes?: boolean;
    includeURLs?: boolean;
    includeTools?: boolean;
    includeCustomTemplates?: boolean;
  } = {}
): ParsedContent[] {
  const {
    includeNotes = true,
    includeURLs = false,
    includeTools = false,
    includeCustomTemplates = false,
  } = options;
  const segments: ParsedContent[] = [];

  // Build regex pattern based on enabled options and track group indices
  const patterns: string[] = [];
  const patternInfo: PatternInfo[] = [];
  let currentGroupIndex = 1;

  if (includeNotes) {
    patterns.push("(\\[\\[([^\\]]+)\\]\\])"); // 2 groups: full match and note name
    patternInfo.push({ type: "notes", groupCount: 2, startIndex: currentGroupIndex });
    currentGroupIndex += 2;
  }
  if (includeURLs) {
    patterns.push("(https?:\\/\\/[^\\s\"'<>]+)"); // 1 group: URL
    patternInfo.push({ type: "urls", groupCount: 1, startIndex: currentGroupIndex });
    currentGroupIndex += 1;
  }
  if (includeTools) {
    patterns.push("(@[a-zA-Z][a-zA-Z0-9_]*)"); // 1 group: @tool
    patternInfo.push({ type: "tools", groupCount: 1, startIndex: currentGroupIndex });
    currentGroupIndex += 1;
  }
  if (includeCustomTemplates) {
    patterns.push("(\\{([^}]+)\\})"); // 2 groups: full match and custom template content
    patternInfo.push({ type: "customTemplates", groupCount: 2, startIndex: currentGroupIndex });
    currentGroupIndex += 2;
  }

  if (patterns.length === 0) {
    // No patterns to match, return as plain text
    return [{ type: "text", content: text }];
  }

  const regex = new RegExp(patterns.join("|"), "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add any text before the match
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index);
      if (textContent) {
        segments.push({
          type: "text",
          content: textContent,
        });
      }
    }

    // Determine which pattern matched by checking which groups are defined
    let matchedPattern: PatternInfo | null = null;
    for (const pattern of patternInfo) {
      if (match[pattern.startIndex]) {
        matchedPattern = pattern;
        break;
      }
    }

    if (!matchedPattern) {
      // Fallback: treat as plain text
      segments.push({
        type: "text",
        content: match[0],
      });
    } else if (matchedPattern.type === "notes") {
      // This is a note link [[note name]]
      const noteName = match[matchedPattern.startIndex + 1].trim();
      const file = resolveNoteReference(app, noteName);

      if (file && file instanceof TFile) {
        // Valid note reference - create pill
        const activeNote = app.workspace.getActiveFile();
        const isActive = activeNote?.path === file.path;

        segments.push({
          type: "note-pill",
          content: file.basename,
          file: file,
          isActive: isActive,
        });
      } else {
        // Invalid note reference - keep as plain text
        segments.push({
          type: "text",
          content: match[0], // Keep the full [[note name]] syntax
        });
      }
    } else if (matchedPattern.type === "urls") {
      // This is a URL
      const url = match[matchedPattern.startIndex].replace(/,+$/, ""); // Remove trailing commas
      if (isValidURL(url)) {
        segments.push({
          type: "url-pill",
          content: url,
          url: url,
        });
      } else {
        // Invalid URL - keep as plain text
        segments.push({
          type: "text",
          content: match[0],
        });
      }
    } else if (matchedPattern.type === "tools") {
      // This is a tool reference @tool
      const toolName = match[matchedPattern.startIndex];
      const resolvedTool = resolveToolReference(toolName);

      if (resolvedTool) {
        segments.push({
          type: "tool-pill",
          content: resolvedTool,
          toolName: resolvedTool,
        });
      } else {
        // Invalid tool reference - keep as plain text
        segments.push({
          type: "text",
          content: match[0],
        });
      }
    } else if (matchedPattern.type === "customTemplates") {
      // This is a custom template: folder reference {folderName} or special {activeNote} syntax
      const templateContent = match[matchedPattern.startIndex + 1].trim();

      // Special case: {activeNote} should create an active-note-pill
      if (templateContent === "activeNote") {
        segments.push({
          type: "active-note-pill",
          content: "activeNote",
        });
      } else {
        const resolvedFolder = resolveFolderReference(app, templateContent);

        if (resolvedFolder) {
          segments.push({
            type: "folder-pill",
            content: resolvedFolder.path,
            folder: resolvedFolder,
          });
        } else {
          // Invalid folder reference - keep as plain text
          segments.push({
            type: "text",
            content: match[0],
          });
        }
      }
    }

    lastIndex = regex.lastIndex;
  }

  // Add any remaining text
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      segments.push({
        type: "text",
        content: remainingText,
      });
    }
  }

  return segments;
}

/**
 * Converts parsed content segments into Lexical nodes
 * @param segments The parsed content segments
 * @returns Array of Lexical nodes
 */
export function createNodesFromSegments(segments: ParsedContent[]): LexicalNode[] {
  const nodes: LexicalNode[] = [];

  for (const segment of segments) {
    if (segment.type === "text" && segment.content) {
      nodes.push($createTextNode(segment.content));
    } else if (segment.type === "active-note-pill") {
      nodes.push($createActiveNotePillNode());
    } else if (segment.type === "note-pill" && segment.file) {
      nodes.push($createNotePillNode(segment.content, segment.file.path));
    } else if (segment.type === "url-pill" && segment.url) {
      nodes.push($createURLPillNode(segment.url));
    } else if (segment.type === "tool-pill" && segment.toolName) {
      nodes.push($createToolPillNode(segment.toolName));
    } else if (segment.type === "folder-pill" && segment.folder) {
      nodes.push($createFolderPillNode(segment.folder.path));
    }
  }

  return nodes;
}

/**
 * Inserts text with automatic conversion of [[note]] references and URLs to pills.
 * This is the main API function that should be used for all programmatic text insertion.
 *
 * @param app The Obsidian `App` instance used to resolve note/folder references
 * @param text The text to insert, which may contain [[note]] references and URLs
 * @param options Configuration options for the insertion
 */
export function $insertTextWithPills(
  app: App,
  text: string,
  options: InsertTextOptions = {}
): void {
  const { enableURLPills = false, insertAtSelection = true } = options;

  if (!text) return;

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    logInfo("No range selection available for text insertion");
    return;
  }

  // Parse the text for note links and optionally URLs
  const segments = parseTextForPills(app, text, {
    includeNotes: true,
    includeURLs: enableURLPills,
  });

  // Convert segments to Lexical nodes
  const nodes = createNodesFromSegments(segments);

  if (nodes.length > 0) {
    if (insertAtSelection) {
      // Insert at current selection
      selection.insertNodes(nodes);
    } else {
      // Replace current selection with nodes
      selection.removeText();
      selection.insertNodes(nodes);
    }
  }
}

/**
 * Generic function to replace text from a trigger character to current cursor position with a pill
 * This can be used by any typeahead plugin that needs to replace triggered text with pills
 * @param triggerChar The character that triggered the replacement (e.g., '@', '/', '[[')
 * @param pillData The pill data to insert
 * @param addSpaceAfter Whether to add a space after the pill (default: true)
 */
export function $replaceTriggeredTextWithPill(
  triggerChar: string,
  pillData: PillData,
  addSpaceAfter: boolean = true
): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;

  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();

  if (!(anchorNode instanceof TextNode)) return;

  const textContent = anchorNode.getTextContent();
  const cursorOffset = anchor.offset;

  // Find the trigger position
  let triggerIndex = -1;

  if (triggerChar === "[[") {
    // Special case for double-bracket triggers
    triggerIndex = textContent.lastIndexOf("[[", cursorOffset);
  } else {
    // Single character triggers
    triggerIndex = textContent.lastIndexOf(triggerChar, cursorOffset);
  }

  if (triggerIndex === -1) return;

  const { beforeText, afterText } = splitTextAtRange(textContent, triggerIndex, cursorOffset);

  // Create the pill node
  const pillNode = $createPillNode(pillData);

  // Insert pill with optional space
  $insertPillWithOptionalSpace(anchorNode, beforeText, pillNode, afterText, addSpaceAfter);
}
