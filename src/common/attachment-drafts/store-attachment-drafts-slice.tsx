import type { StoreApi } from 'zustand';
import type { StateCreator } from 'zustand/vanilla';

import type { DMessageAttachmentFragment } from '~/common/stores/chat/chat.message';

import type { AttachmentDraft, AttachmentDraftId, AttachmentDraftSource } from './attachment.types';
import { attachmentCreate, attachmentDefineConverters, attachmentLoadInputAsync, attachmentPerformConversion } from './attachment.pipeline';


/// Attachment Draft Slice: per-conversation attachments store ///

interface AttachmentDraftsState {

  attachmentDrafts: AttachmentDraft[];

}

export interface AttachmentsDraftsStore extends AttachmentDraftsState {

  createAttachmentDraft: (source: AttachmentDraftSource) => Promise<void>;
  clearAttachmentsDrafts: () => void;
  removeAttachmentDraft: (attachmentDraftId: AttachmentDraftId) => void;
  moveAttachmentDraft: (attachmentDraftId: AttachmentDraftId, delta: 1 | -1) => void;
  setAttachmentDraftConverterIdxAndConvert: (attachmentDraftId: AttachmentDraftId, converterIdx: number | null) => Promise<void>;

  /**
   * Extracts all fragments from the all drafts and clears the store.
   */
  takeAllFragments: (removeFragments: boolean) => DMessageAttachmentFragment[];

  /**
   * Extracts text fragments from the attachment drafts and optionally removes them from the store.
   * If `attachmentDraftId` is null, all the attachments are processed, otherwise only this.
   */
  takeTextFragments: (attachmentDraftId: AttachmentDraftId | null, removeFragments: boolean) => DMessageAttachmentFragment[];

  _editAttachment: (attachmentDraftId: AttachmentDraftId, update: Partial<AttachmentDraft> | ((attachment: AttachmentDraft) => Partial<AttachmentDraft>)) => void;
  _getAttachment: (attachmentDraftId: AttachmentDraftId) => AttachmentDraft | undefined;

}

export type AttachmentDraftsStoreApi = StoreApi<AttachmentsDraftsStore>;

export const createAttachmentDraftsStoreSlice: StateCreator<AttachmentsDraftsStore, [], [], AttachmentsDraftsStore> = (_set, _get) => ({

  // init state
  attachmentDrafts: [],

  // actions
  createAttachmentDraft: async (source: AttachmentDraftSource) => {
    const { _getAttachment, _editAttachment, setAttachmentDraftConverterIdxAndConvert } = _get();

    const _attachmentDraft = attachmentCreate(source);
    _set(store => ({
      attachmentDrafts: [...store.attachmentDrafts, _attachmentDraft],
    }));

    const attachmentDraftId = _attachmentDraft.id;
    const editFn = (changes: Partial<AttachmentDraft>) => _editAttachment(attachmentDraftId, changes);

    // 1.Resolve the Input
    await attachmentLoadInputAsync(source, editFn);
    const loaded = _getAttachment(attachmentDraftId);
    if (!loaded?.input)
      return;

    // 2. Define the I->O Converters
    attachmentDefineConverters(source.media, loaded.input, editFn);
    const defined = _getAttachment(attachmentDraftId);
    if (!defined?.converters.length || defined.converterIdx !== null)
      return;

    // 3. Select the first Converter
    const firstEnabledIndex = defined.converters.findIndex(_c => !_c.disabled);
    await setAttachmentDraftConverterIdxAndConvert(attachmentDraftId, firstEnabledIndex > -1 ? firstEnabledIndex : 0);
  },

  clearAttachmentsDrafts: () => _set({
    attachmentDrafts: [],
  }),

  removeAttachmentDraft: (attachmentDraftId: AttachmentDraftId) =>
    _set(state => ({
      attachmentDrafts: state.attachmentDrafts.filter(attachment => attachment.id !== attachmentDraftId),
    })),

  moveAttachmentDraft: (attachmentDraftId: AttachmentDraftId, delta: 1 | -1) =>
    _set(state => {
      const attachments = [...state.attachmentDrafts];
      const currentIdx = attachments.findIndex(a => a.id === attachmentDraftId);

      // If the draft is not found, or if trying to move beyond the array boundaries, no move is needed
      if (currentIdx === -1 || (currentIdx === 0 && delta === -1) || (currentIdx === attachments.length - 1 && delta === 1))
        return state;

      // Swap the draft with the adjacent one in the direction of delta
      const targetIdx = currentIdx + delta;
      [attachments[currentIdx], attachments[targetIdx]] = [attachments[targetIdx], attachments[currentIdx]];

      return { attachmentDrafts: attachments };
    }),

  setAttachmentDraftConverterIdxAndConvert: async (attachmentDraftId: AttachmentDraftId, converterIdx: number | null) => {
    const { _getAttachment, _editAttachment } = _get();
    const attachmentDraft = _getAttachment(attachmentDraftId);
    if (!attachmentDraft || attachmentDraft.converterIdx === converterIdx)
      return;

    const editFn = (changes: Partial<AttachmentDraft>) => _editAttachment(attachmentDraftId, changes);

    await attachmentPerformConversion(attachmentDraft, converterIdx, editFn);
  },

  takeAllFragments: (removeFragments: boolean): DMessageAttachmentFragment[] => {
    const allFragments: DMessageAttachmentFragment[] = [];
    _get().attachmentDrafts.forEach(draft => {
      allFragments.push(...draft.outputFragments);
    });

    if (removeFragments)
      _set({ attachmentDrafts: [] });

    return allFragments;
  },

  takeTextFragments: (attachmentDraftId: AttachmentDraftId | null, removeFragments: boolean): DMessageAttachmentFragment[] => {
    const { attachmentDrafts } = _get();

    const textFragments: DMessageAttachmentFragment[] = [];
    const keptDrafts: AttachmentDraft[] = [];

    for (const draft of attachmentDrafts) {

      // non-touched attachments
      if (attachmentDraftId !== null && draft.id !== attachmentDraftId) {
        keptDrafts.push(draft);
        continue;
      }

      // Extract
      const extractedTextFragments = draft.outputFragments.filter(fragment => fragment.part.pt === 'text');
      textFragments.push(...extractedTextFragments);

      // keep as-is if there's nothing to remove
      if (!removeFragments || extractedTextFragments.length === 0) {
        keptDrafts.push(draft);
        continue;
      }

      // Remove text fragments
      const remainingFragments = draft.outputFragments.filter(fragment => fragment.part.pt !== 'text');
      if (remainingFragments.length || draft.outputsConverting) {
        keptDrafts.push({
          ...draft,
          outputFragments: remainingFragments,
        });
      }
    }

    // Remove the text fragments if requested
    if (removeFragments)
      _set({
        attachmentDrafts: keptDrafts,
      });

    return textFragments;
  },

  _editAttachment: (attachmentDraftId: AttachmentDraftId, update: Partial<AttachmentDraft> | ((attachment: AttachmentDraft) => Partial<AttachmentDraft>)) =>
    _set(state => ({
      attachmentDrafts: state.attachmentDrafts.map((attachmentDraft: AttachmentDraft): AttachmentDraft =>
        attachmentDraft.id === attachmentDraftId
          ? { ...attachmentDraft, ...(typeof update === 'function' ? update(attachmentDraft) : update) }
          : attachmentDraft,
      ),
    })),

  _getAttachment: (attachmentDraftId: AttachmentDraftId) =>
    _get().attachmentDrafts.find(a => a.id === attachmentDraftId),

});
