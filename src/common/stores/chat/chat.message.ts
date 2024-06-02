import type { DBlobId } from '~/modules/dblobs/dblobs.types';

import { createBase64UuidV4 } from '~/common/util/textUtils';


// Message

export interface DMessage {
  id: DMessageId;                     // unique message ID

  role: DMessageRole;
  fragments: DMessageFragment[];      // fragments can be content/attachments/... implicitly ordered

  // pending state (not stored)
  pendingIncomplete?: boolean;        // if true, the message is incomplete (e.g. tokens won't be computed)
  pendingPlaceholderText?: string;    // text being typed, not yet sent

  // identity
  avatar: string | null;              // image URL, or null
  sender: 'You' | 'Bot' | string;     // pretty name @deprecated

  purposeId?: string;                 // only assistant/system
  originLLM?: string;                 // only assistant - model that generated this message, goes beyond known models

  metadata?: DMessageMetadata;        // metadata, mainly at creation and for UI
  userFlags?: DMessageUserFlag[];     // (UI) user-set per-message flags

  // TODO: @deprecated remove this, it's really view-dependent
  tokenCount: number;                 // cache for token count, using the current Conversation model (0 = not yet calculated)

  // TODO: add a Beam JSON state load/store
  // volatileBeamRestore?: object;

  created: number;                    // created timestamp
  updated: number | null;             // updated timestamp - null means incomplete - TODO: disambiguate vs pendingIncomplete
}

export type DMessageId = string;
export type DMessageRole = 'user' | 'assistant' | 'system';


// Message Fragments
// - mostly Parts with a purpose and extra information, with forward compatibility

export type DMessageFragment =
  | DMessageContentFragment
  | DMessageAttachmentFragment
  ;

export type DMessageContentFragment = {
  ft: 'content',
  part: DMessageTextPart | DMessageImagePart | DMessageToolCallPart | DMessageToolResponsePart;
}

export type DMessageAttachmentFragment = {
  ft: 'attachment',
  title: string;
  part: DMessageTextPart | DMessageImagePart;
}


// Message Fragment Parts
// - small and efficient (larger objects need to only be referred to)

type DMessageTextPart = { pt: 'text', text: string };
type DMessageImagePart = { pt: 'image_ref', dataRef: DDataRef, altText?: string, width?: number, height?: number };
type DMessageToolCallPart = { pt: 'tool_call', function: string, args: Record<string, any> };
type DMessageToolResponsePart = { pt: 'tool_response', function: string, response: Record<string, any> };


// Data Reference - we use a Ref and the DBlob framework to store media locally, or remote URLs

export type DDataRef =
  | { reftype: 'url'; url: string } // remotely accessible URL
  | { reftype: 'dblob'; dblobId: DBlobId, mimeType: string; bytesSize: number; } // reference to a DBlob
  ;

// type DDataInline =
//   | { stype: 'base64'; mimeType: string; base64Data: string }
//   ;


// Metadata

export interface DMessageMetadata {
  inReplyToText?: string;           // text this was in reply to
}


// User Flags

export type DMessageUserFlag =
  | 'starred'; // user starred this


// helpers - creation

export function createEmptyDMessage(role: DMessageRole) {
  return createDMessage(role, []);
}

export function createTextContentDMessage(role: DMessageRole, text: string): DMessage {
  return createDMessage(role, [createTextContentFragment(text)]);
}

export function createDMessage(role: DMessageRole, fragments: DMessageFragment[]): DMessage {
  return {
    id: createBase64UuidV4(),

    role: role,
    fragments,

    // pending state
    // pendingIncomplete: false,
    // pendingPlaceholderText: undefined,

    // identity
    avatar: null,
    sender: role === 'user' ? 'You' : 'Bot',

    // absent
    // purposeId: undefined,
    // originLLM: undefined,
    // metadata: undefined,
    // userFlags: undefined,

    // @deprecated
    tokenCount: 0,

    created: Date.now(),
    updated: null,
  };
}


export function createTextContentFragment(text: string): DMessageContentFragment {
  return { ft: 'content', part: { pt: 'text', text: text } };
}

export function createAttachmentFragment(title: string, part: DMessageTextPart | DMessageImagePart): DMessageAttachmentFragment {
  return { ft: 'attachment', title, part };
}

export function createTextAttachmentFragment(text: string, title: string): DMessageAttachmentFragment {
  return { ft: 'attachment', title, part: { pt: 'text', text } };
}

export function pendDMessage(message: DMessage, placeholderText?: string): DMessage {
  message.pendingIncomplete = true;
  if (placeholderText)
    message.pendingPlaceholderText = placeholderText;
  else
    delete message.pendingPlaceholderText;
  return message;
}


// helpers - duplication

export function duplicateDMessage(message: Readonly<DMessage>): DMessage {
  return {
    id: createBase64UuidV4(),

    role: message.role,
    fragments: _duplicateFragments(message.fragments),

    ...(message.pendingIncomplete ? { pendingIncomplete: true } : {}),
    ...(message.pendingPlaceholderText ? { pendingPlaceholderText: message.pendingPlaceholderText } : {}),

    avatar: message.avatar,
    sender: message.sender,

    purposeId: message.purposeId,
    originLLM: message.originLLM,
    metadata: message.metadata ? { ...message.metadata } : undefined,
    userFlags: message.userFlags ? [...message.userFlags] : undefined,

    tokenCount: message.tokenCount,

    created: message.created,
    updated: message.updated,
  };
}

function _duplicateFragments(fragments: DMessageFragment[]): DMessageFragment[] {
  return fragments.map(fragment => {
    switch (fragment.ft) {
      case 'content':
        return { ft: 'content', part: _duplicatePart(fragment.part) };

      case 'attachment':
        return createAttachmentFragment(fragment.title, _duplicatePart(fragment.part));

      default:
        throw new Error('Invalid fragment');
    }
  });
}

function _duplicatePart<T extends DMessageFragment['part']>(part: T): T {
  switch (part.pt) {
    case 'text':
      return {
        pt: 'text',
        text: part.text,
      } as T;

    case 'image_ref':
      return {
        pt: 'image_ref',
        dataRef: {
          ...part.dataRef,
        },
        altText: part.altText,
        width: part.width,
        height: part.height,
      } as T;

    case 'tool_call':
      return {
        pt: 'tool_call',
        function: part.function,
        args: {
          ...part.args,
        },
      } as T;

    case 'tool_response':
      return {
        pt: 'tool_response',
        function: part.function,
        response: {
          ...part.response,
        },
      } as T;

    default:
      throw new Error('Invalid part');
  }
}


// helpers during the transition from V3

export function messageFragmentsReduceText(fragments: DMessageFragment[], fragmentSeparator: string = '\n\n'): string {
  return fragments
    .map(fragment => fragment.part.pt === 'text' ? fragment.part.text : '')
    .filter(text => !!text)
    .join(fragmentSeparator);
}

export function messageFragmentsReplaceLastText(fragments: Readonly<DMessageFragment[]>, newText: string, appendText?: boolean): DMessageFragment[] {

  // if there's no text fragment, create it
  const lastTextFragment = fragments.findLast(f => f.part.pt === 'text');
  if (!lastTextFragment)
    return [...fragments, createTextContentFragment(newText)];

  // append/replace the last text fragment
  return fragments.map(fragment =>
    (fragment === lastTextFragment)
      ? createTextContentFragment((appendText && fragment.part.pt === 'text') ? fragment.part.text + newText : newText)
      : fragment,
  );
}

// TODO: remove once the port is fully done
export function messageSingleTextOrThrow(message: DMessage): string {
  if (message.fragments.length !== 1)
    throw new Error('Expected single fragment');
  if (message.fragments[0].part.pt !== 'text')
    throw new Error('Expected a text part');
  return message.fragments[0].part.text;
}


// helpers - user flags

const flag2EmojiMap: Record<DMessageUserFlag, string> = {
  starred: '⭐️',
};

export function messageUserFlagToEmoji(flag: DMessageUserFlag): string {
  return flag2EmojiMap[flag] || '❓';
}

export function messageHasUserFlag(message: DMessage, flag: DMessageUserFlag): boolean {
  return message.userFlags?.includes(flag) ?? false;
}

export function messageToggleUserFlag(message: DMessage, flag: DMessageUserFlag): DMessageUserFlag[] {
  if (message.userFlags?.includes(flag))
    return message.userFlags.filter(_f => _f !== flag);
  else
    return [...(message.userFlags || []), flag];
}
