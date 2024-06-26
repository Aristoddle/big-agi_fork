import * as React from 'react';

import type { DConversationId } from '~/common/stores/chat/chat.conversation';

import { useChatLLMDropdown } from './useLLMDropdown';
import { usePersonaIdDropdown } from './usePersonaDropdown';
import { useFolderDropdown } from './useFolderDropdown';


export function ChatBarDropdowns(props: {
  conversationId: DConversationId | null
}) {

  // state
  const { chatLLMDropdown } = useChatLLMDropdown();
  const { personaDropdown } = usePersonaIdDropdown(props.conversationId);
  const { folderDropdown } = useFolderDropdown(props.conversationId);

  return <>

    {/* Persona selector */}
    {personaDropdown}

    {/* Model selector */}
    {chatLLMDropdown}

    {/* Folder selector */}
    {folderDropdown}

  </>;
}
