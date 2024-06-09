import * as React from 'react';

import { Box, Link, ListDivider, ListItem, ListItemDecorator, MenuItem, Radio, Typography } from '@mui/joy';
import ClearIcon from '@mui/icons-material/Clear';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import LaunchIcon from '@mui/icons-material/Launch';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';

import { getImageBlobURLById } from '~/modules/dblobs/dblobs.db';

import type { DDataRef, DMessageAttachmentFragment } from '~/common/stores/chat/chat.message';
import { CloseableMenu } from '~/common/components/CloseableMenu';

import type { AttachmentDraftId } from '~/common/attachment-drafts/attachment.types';
import type { AttachmentDraftsStoreApi } from '~/common/attachment-drafts/store-attachment-drafts-slice';
import type { LLMAttachmentDraft } from './useLLMAttachmentDrafts';
import type { LLMAttachmentDraftsAction } from './LLMAttachmentsList';


// enable for debugging
export const DEBUG_LLMATTACHMENTS = true;


/**
 * Note: this utility function could be extracted more broadly to chat.message.ts, but
 * I don't want to introduce a (circular) dependency from chat.message.ts to dblobs.db.ts.
 */
async function handleShowDataRefInNewTab(dataRef: DDataRef) {
  let imageUrl: string | null = null;
  if (dataRef.reftype === 'url')
    imageUrl = dataRef.url;
  else if (dataRef.reftype === 'dblob')
    imageUrl = await getImageBlobURLById(dataRef.dblobId);
  if (imageUrl && typeof window !== 'undefined')
    window.open(imageUrl, '_blank', 'noopener,noreferrer');
}


export function LLMAttachmentMenu(props: {
  attachmentDraftsStoreApi: AttachmentDraftsStoreApi,
  llmAttachmentDraft: LLMAttachmentDraft,
  menuAnchor: HTMLAnchorElement,
  isPositionFirst: boolean,
  isPositionLast: boolean,
  onDraftAction: (attachmentDraftId: AttachmentDraftId, actionId: LLMAttachmentDraftsAction) => void,
  onClose: () => void,
}) {

  // derived state

  const {
    attachmentDraft: draft,
    llmSupportsTextFragments,
    llmTokenCountApprox,
  } = props.llmAttachmentDraft;

  const draftId = draft.id;
  const draftInput = draft.input;
  const isUnconvertible = !draft.converters.length;
  const isOutputMissing = !draft.outputFragments.length;

  const isUnmoveable = props.isPositionFirst && props.isPositionLast;


  // operations

  const { attachmentDraftsStoreApi, onDraftAction, onClose } = props;

  const handleMoveUp = React.useCallback(() => {
    attachmentDraftsStoreApi.getState().moveAttachmentDraft(draftId, -1);
  }, [draftId, attachmentDraftsStoreApi]);

  const handleMoveDown = React.useCallback(() => {
    attachmentDraftsStoreApi.getState().moveAttachmentDraft(draftId, 1);
  }, [draftId, attachmentDraftsStoreApi]);

  const handleRemove = React.useCallback(() => {
    onClose();
    attachmentDraftsStoreApi.getState().removeAttachmentDraft(draftId);
  }, [draftId, attachmentDraftsStoreApi, onClose]);

  const handleSetConverterIdx = React.useCallback(async (converterIdx: number | null) => {
    return attachmentDraftsStoreApi.getState().setAttachmentDraftConverterIdxAndConvert(draftId, converterIdx);
  }, [draftId, attachmentDraftsStoreApi]);

  // const handleSummarizeText = React.useCallback(() => {
  //   onAttachmentDraftSummarizeText(draftId);
  // }, [draftId, onAttachmentDraftSummarizeText]);


  return (
    <CloseableMenu
      dense placement='top'
      open anchorEl={props.menuAnchor} onClose={props.onClose}
      sx={{ minWidth: 260 }}
    >

      {/* Move Arrows */}
      {!isUnmoveable && <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <MenuItem
          disabled={props.isPositionFirst}
          onClick={handleMoveUp}
          sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}
        >
          <KeyboardArrowLeftIcon />
        </MenuItem>
        <MenuItem
          disabled={props.isPositionLast}
          onClick={handleMoveDown}
          sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}
        >
          <KeyboardArrowRightIcon />
        </MenuItem>
      </Box>}
      {!isUnmoveable && <ListDivider sx={{ mt: 0 }} />}

      {/* Render Converters as menu items */}
      {!isUnconvertible && (
        <ListItem>
          <Typography level='body-sm'>
            Attach as:
          </Typography>
        </ListItem>
      )}
      {!isUnconvertible && draft.converters.map((c, idx) =>
        <MenuItem
          disabled={c.disabled}
          key={'c-' + c.id}
          onClick={async () => idx !== draft.converterIdx && await handleSetConverterIdx(idx)}
        >
          <ListItemDecorator>
            <Radio checked={idx === draft.converterIdx} />
          </ListItemDecorator>
          {c.unsupported
            ? <Box>Unsupported 🤔 <Typography level='body-xs'>{c.name}</Typography></Box>
            : c.name}
        </MenuItem>,
      )}
      {!isUnconvertible && <ListDivider />}

      {DEBUG_LLMATTACHMENTS && !!draftInput && (
        <ListItem>
          <ListItemDecorator />
          <Box>
            {!!draftInput && (
              <Typography level='body-sm'>
                🡐 {draftInput.mimeType} · {draftInput.dataSize.toLocaleString()}
              </Typography>
            )}
            {!!draftInput?.altMimeType && (
              <Typography level='body-sm'>
                <span style={{ color: 'transparent' }}>🡐</span> {draftInput.altMimeType} · {draftInput.altData?.length.toLocaleString()}
              </Typography>
            )}
            {/*<Typography level='body-sm'>*/}
            {/*  Converters: {aConverters.map(((converter, idx) => ` ${converter.id}${(idx === draft.converterIdx) ? '*' : ''}`)).join(', ')}*/}
            {/*</Typography>*/}
            <Box>
              {isOutputMissing ? (
                <Typography level='body-sm'>🡒 ...</Typography>
              ) : (
                draft.outputFragments.map(({ part }, index) => {
                  if (part.pt === 'image_ref') {
                    const resolution = part.width && part.height ? `${part.width} x ${part.height}` : 'unknown resolution';
                    const mime = part.dataRef.reftype === 'dblob' ? part.dataRef.mimeType : 'unknown image';
                    return (
                      <Typography key={index} level='body-sm'>
                        🡒 {mime/*unic.replace('image/', 'img: ')*/} · {resolution} · {part.dataRef.reftype === 'dblob' ? part.dataRef.bytesSize?.toLocaleString() : '(remote)'}
                        {' · '}
                        <Link onClick={() => handleShowDataRefInNewTab(part.dataRef)}>
                          open <LaunchIcon sx={{ mx: 0.5, fontSize: 16 }} />
                        </Link>
                      </Typography>
                    );
                  } else if (part.pt === 'text') {
                    return (
                      <Typography key={index} level='body-sm'>
                        🡒 text: {part.text.length.toLocaleString()} bytes
                      </Typography>
                    );
                  } else {
                    return (
                      <Typography key={index} level='body-sm'>
                        🡒 {(part as DMessageAttachmentFragment['part']).pt}: (other)
                      </Typography>
                    );
                  }
                })
              )}
              {!!llmTokenCountApprox && (
                <Typography level='body-sm' sx={{ ml: 1.75 }}>
                  ~ {llmTokenCountApprox.toLocaleString()} tokens
                </Typography>
              )}
            </Box>
          </Box>
        </ListItem>
      )}
      {DEBUG_LLMATTACHMENTS && !!draftInput && <ListDivider />}

      {/* Destructive Operations */}
      {/*<MenuItem onClick={handleCopyToClipboard} disabled={!isOutputTextInlineable}>*/}
      {/*  <ListItemDecorator><ContentCopyIcon /></ListItemDecorator>*/}
      {/*  Copy*/}
      {/*</MenuItem>*/}
      {/*<MenuItem onClick={handleSummarizeText} disabled={!isOutputTextInlineable}>*/}
      {/*  <ListItemDecorator><CompressIcon color='success' /></ListItemDecorator>*/}
      {/*  Shrink*/}
      {/*</MenuItem>*/}
      <MenuItem onClick={() => onDraftAction(draftId, 'inline-text')} disabled={!llmSupportsTextFragments}>
        <ListItemDecorator><VerticalAlignBottomIcon /></ListItemDecorator>
        Inline text
      </MenuItem>
      <MenuItem onClick={() => onDraftAction(draftId, 'copy-text')} disabled={!llmSupportsTextFragments}>
        <ListItemDecorator><ContentCopyIcon /></ListItemDecorator>
        Copy text
      </MenuItem>
      <ListDivider />
      <MenuItem onClick={handleRemove}>
        <ListItemDecorator><ClearIcon /></ListItemDecorator>
        Remove
      </MenuItem>

    </CloseableMenu>
  );
}