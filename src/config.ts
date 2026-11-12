import * as vscode from 'vscode'

export type Mode = 'paragraph' | 'message'

export interface RuntimeConfig {
  threshold: number
  mode: Mode
  messageSelector: string
}

export const SETTINGS_SECTION = 'smartRtl'

const MODES: readonly Mode[] = ['paragraph', 'message']

// Kept in step with the defaults in runtime/smartRtl.js, which applies them on
// its own when it is pasted into the console with no settings at all.

const DEFAULTS = {
  threshold: 0.3,
  mode: 'paragraph',
  messageSelector: [
    '.anysphere-markdown-container-root',
    '.markdown-root',
    '.ui-agent-transcript-human-bubble',
    '.composer-human-message',
    '.aislash-editor-input-readonly',
    '.aislash-editor-input',
    '.ProseMirror',
    '.interactive-item-container .rendered-markdown',
    '.chat-markdown-part',
    '.font-claude-response .standard-markdown',
    '.font-claude-response .progressive-markdown',
    '[data-testid="user-message"]',
  ].join(', '),
} as const

// A share outside (0, 1] would either flip every message or none, so it falls
// back to the shipped value instead of being obeyed.
const readShare = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback

const isMode = (value: unknown): value is Mode =>
  typeof value === 'string' && (MODES as readonly string[]).includes(value)

const readNonEmptyString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback

export const readRuntimeConfig = (): RuntimeConfig => {
  const settings = vscode.workspace.getConfiguration(SETTINGS_SECTION)

  return {
    threshold: readShare(settings.get('threshold'), DEFAULTS.threshold),
    mode: isMode(settings.get('mode')) ? (settings.get('mode') as Mode) : DEFAULTS.mode,
    messageSelector: readNonEmptyString(settings.get('messageSelector'), DEFAULTS.messageSelector),
  }
}
