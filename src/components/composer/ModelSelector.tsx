import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { text } from '../../i18n';
import { API_MODEL_OPTIONS } from '../../config/apiModels';
import { discoverCodexModels } from '../../services/bridge';

export function ModelSelector({ close }: { close: () => void }) {
  const {
    model,
    providerMode,
    apiModels,
    codexModels: availableCodexModels,
    bridgeState,
    uiLanguage,
    setModel,
    setCodexModels,
  } = useAppStore();
  const [customModel, setCustomModel] = useState(model === 'ChatGPT via Codex' ? '' : model);
  useEffect(() => {
    if (providerMode !== 'chatgpt' || bridgeState !== 'connected') return;
    let active = true;
    void discoverCodexModels().then((result) => {
      if (active && result.ok && result.models?.length) setCodexModels(result.models);
    });
    return () => {
      active = false;
    };
  }, [bridgeState, providerMode, setCodexModels]);
  const selectableApiModels = [...new Set([
    model,
    ...(apiModels.length ? apiModels : API_MODEL_OPTIONS),
  ])]
    .filter((item) => item && item !== 'ChatGPT via Codex');
  const selectableCodexModels = [...new Set([
    'ChatGPT via Codex',
    ...availableCodexModels,
    model,
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
    models: providerMode === 'api' ? selectableApiModels : selectableCodexModels,
  }];
  return <div className="popover model-popover" role="dialog" aria-label={text(uiLanguage, 'Choose model', '选择模型')}><div className="popover-title">{text(uiLanguage, 'Model', '模型')}</div>
    {groups.map((group) => <div className="model-group" key={group.name}><div className="model-group-name">{group.name}</div>{group.models.map((item) => <button key={item} onClick={() => { setModel(item); close(); }}><span>{item === 'ChatGPT via Codex' ? text(uiLanguage, 'Codex default (recommended)', 'Codex 默认（推荐）') : item}</span>{model === item && <Check size={15} />}</button>)}</div>)}
    <div className="model-custom">
      <label htmlFor="paperflow-custom-model">{text(
        uiLanguage,
        providerMode === 'api' ? 'Custom API model ID' : 'Optional Codex model override',
        providerMode === 'api' ? '自定义 API 模型 ID' : '可选的 Codex 模型覆盖',
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
