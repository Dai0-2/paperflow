import { useAppStore } from '../../store/useAppStore';
import { text } from '../../i18n';
import {
  API_MODEL_OPTIONS,
  CUSTOM_API_MODEL,
} from '../../config/apiModels';

export function ApiModelField() {
  const { model, apiModels, setModel, uiLanguage } = useAppStore();
  const availableModels = apiModels.length ? apiModels : API_MODEL_OPTIONS;
  const selected = availableModels.includes(model) ? model : CUSTOM_API_MODEL;

  return <>
    <label>
      <span>{text(uiLanguage, 'Model ID', '模型 ID')}</span>
      <select
        aria-label={text(uiLanguage, 'Model ID', '模型 ID')}
        value={selected}
        onChange={(event) => {
          const value = event.target.value;
          setModel(value === CUSTOM_API_MODEL ? '' : value);
        }}
      >
        {availableModels.map((option) => <option key={option} value={option}>
          {option}
        </option>)}
        <option value={CUSTOM_API_MODEL}>
          {text(uiLanguage, 'Custom model…', '自定义模型…')}
        </option>
      </select>
    </label>
    {selected === CUSTOM_API_MODEL && <label>
      <span>{text(uiLanguage, 'Custom model ID', '自定义模型 ID')}</span>
      <input
        aria-label={text(uiLanguage, 'Custom model ID', '自定义模型 ID')}
        value={model}
        onChange={(event) => setModel(event.target.value)}
        placeholder="provider/model-id"
        spellCheck={false}
      />
    </label>}
  </>;
}
