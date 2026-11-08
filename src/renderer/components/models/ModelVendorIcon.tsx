import { CubeIcon } from '@heroicons/react/24/outline';
import React from 'react';

import { ModelVendor } from '../../../shared/models/constants';
import { ProviderName } from '../../../shared/providers';
import { AnthropicIcon, DeepSeekIcon, GeminiIcon, MiniMaxIcon, MoonshotIcon, OpenAIIcon, QwenIcon, VolcengineIcon, XiaomiIcon, ZhipuIcon } from '../icons/providers';
import CiyuanIcon from '../icons/providers/CiyuanIcon';

export function ModelVendorIcon({ vendor }: { vendor: string }) {
  const icons: Partial<Record<string, React.ReactNode>> = {
    [ModelVendor.OpenAI]: <OpenAIIcon />,
    [ModelVendor.Google]: <GeminiIcon />,
    [ProviderName.Gemini]: <GeminiIcon />,
    [ModelVendor.Anthropic]: <AnthropicIcon />,
    [ModelVendor.DeepSeek]: <DeepSeekIcon />,
    [ModelVendor.Moonshot]: <MoonshotIcon />,
    [ModelVendor.Qwen]: <QwenIcon />,
    [ModelVendor.Zhipu]: <ZhipuIcon />,
    [ModelVendor.Minimax]: <MiniMaxIcon />,
    [ModelVendor.Volcengine]: <VolcengineIcon />,
    [ModelVendor.Xiaomi]: <XiaomiIcon />,
    [ProviderName.Ciyuan]: <CiyuanIcon />,
    [ProviderName.TokenDance]: <span className="font-semibold text-primary">T</span>,
  };
  return <span className={`flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5 ${vendor === ProviderName.Ciyuan ? 'text-primary' : 'text-foreground'}`}>{icons[vendor] ?? <CubeIcon />}</span>;
}
