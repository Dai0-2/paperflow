import { Check } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { text } from '../../i18n';

export function ModelSelector({ close }: { close: () => void }) {
  const { model, providerMode, uiLanguage, setModel } = useAppStore();
  const [customModel, setCustomModel] = useState(model === 'ChatGPT via Codex' ? '' : model);
  const apiModels = [...new Set([model, 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'])]
    .filter((item) => item && item !== 'ChatGPT via Codex');
  const codexModels = [...new Set([
    model,
    'ChatGPT via Codex',
    'gpt-5.6-sol',
    'gpt-5.6-luna',
  ])].filter(Boolean);
  const selectCustomModel = () => {
    const value = customModel.trim();
    if (!value) return;
    setModel(value);
    close();
  };
  const groups = [{
    name: providerMode === 'api'
      ? text(uiLanguage, 'OpenAI-compatible API', 'OpenAI 兼容 API')
      : text(uiLanguage, 'ChatGPT subscription', 'ChatGPT 订阅'),
    models: providerMode === 'api' ? apiModels : codexModels,
  }];
  return <div className="popover model-popover" role="dialog" aria-label={text(uiLanguage, 'Choose model', '选择模型')}><div className="popover-title">{text(uiLanguage, 'Model', '模型')}</div>
    {groups.map((group) => <div className="model-group" key={group.name}><div className="model-group-name">{group.name}</div>{group.models.map((item) => <button key={item} onClick={() => { setModel(item); close(); }}><span>{item === 'ChatGPT via Codex' ? text(uiLanguage, 'Codex default (recommended)', 'Codex 默认（推荐）') : item}</span>{model === item && <Check size={15} />}</button>)}</div>)}
    <div className="model-custom">
      <label htmlFor="paperflow-custom-model">{text(
        uiLanguage,
        providerMode === 'api' ? 'Custom API model ID' : 'Custom Codex model ID',
        providerMode === 'api' ? '自定义 API 模型 ID' : '自定义 Codex 模型 ID',
      )}</label>
      <div>
        <input
          id="paperflow-custom-model"
          aria-label={text(uiLanguage, 'Custom model ID', '自定义模型 ID')}
          value={customModel}
          placeholder={providerMode === 'api' ? 'provider/model-id' : 'gpt-model-id'}
          onChange={(event) => setCustomModel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') selectCustomModel();
          }}
        />
        <button disabled={!customModel.trim()} onClick={selectCustomModel}>
          {text(uiLanguage, 'Use', '使用')}
        </button>
      </div>
    </div>
  </div>;
}
