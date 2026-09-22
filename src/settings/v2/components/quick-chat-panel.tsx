import { useChatBackendModelOptions } from "@/hooks/use-chat-backend-model-options";
import { updateSetting, useSettingsValue } from "@/settings/model";
import { ChatModelEnableList } from "@/settings/v2/components/chat-model-enable-list";
import { QuickChatModelSettings } from "@/settings/v2/components/ui/quick-chat-model-settings";
import React from "react";

/** Binds shared Quick Chat controls to the model registry on desktop and mobile. */
export const QuickChatPanel: React.FC = () => {
  const settings = useSettingsValue();
  const { options, resolveSelectionId } = useChatBackendModelOptions();
  return (
    <QuickChatModelSettings
      defaultModelId={resolveSelectionId(settings.defaultModelKey)}
      options={options}
      onDefaultModelChange={(value) => updateSetting("defaultModelKey", value)}
    >
      <ChatModelEnableList />
    </QuickChatModelSettings>
  );
};
