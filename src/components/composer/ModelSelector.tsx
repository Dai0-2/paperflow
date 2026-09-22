import { Check } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { text } from '../../i18n';

export function ModelSelector({ close }: { close: () => void }) {
  const { model, providerMode, uiLanguage, setModel } = useAppStore();
  const groups = [{ name: providerMode === 'api' ? 'OpenAI API' : text(uiLanguage, 'ChatGPT subscription', 'ChatGPT 订阅'), models: providerMode === 'api' ? ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra'] : ['ChatGPT via Codex'] }];
  return <div className="popover model-popover" role="dialog" aria-label={text(uiLanguage, 'Choose model', '选择模型')}><div className="popover-title">{text(uiLanguage, 'Model', '模型')}</div>
    {groups.map((group) => <div className="model-group" key={group.name}><div className="model-group-name">{group.name}</div>{group.models.map((item) => <button key={item} onClick={() => { setModel(item); close(); }}><span>{item}</span>{model === item && <Check size={15} />}</button>)}</div>)}
  </div>;
}
