export interface PromptPreset {
  id: string;
  label: { en: string; zh: string };
  prompt: { en: string; zh: string };
}

export const promptPresets: PromptPreset[] = [
  {
    id: 'translate',
    label: { en: 'Translate', zh: '翻译' },
    prompt: { en: 'Translate the selected passage into clear, faithful English. Preserve technical terms, notation, and equations.', zh: '将选中段落准确、清晰地翻译成中文，并保留专业术语、符号和公式。' },
  },
  {
    id: 'summarize',
    label: { en: 'Summarize', zh: '总结' },
    prompt: { en: 'Summarize this paper in five concise points: problem, core idea, method, evidence, and main takeaway.', zh: '用五个要点总结这篇论文：研究问题、核心思想、方法、证据和主要结论。' },
  },
  {
    id: 'key-points',
    label: { en: 'Key Points', zh: '关键点' },
    prompt: { en: 'Extract the most important claims and findings from this paper. Explain why each one matters.', zh: '提取论文最重要的主张和发现，并说明每一点为什么重要。' },
  },
  {
    id: 'methodology',
    label: { en: 'Methodology', zh: '研究方法' },
    prompt: { en: 'Walk me through the methodology step by step, including the training objective, data flow, and key design choices.', zh: '逐步讲解研究方法，包括训练目标、数据流和关键设计选择。' },
  },
  {
    id: 'limitations',
    label: { en: 'Limitations', zh: '局限性' },
    prompt: { en: 'Critically analyze the limitations of this paper, separating limitations acknowledged by the authors from additional concerns.', zh: '批判性分析论文的局限性，并区分作者承认的限制与其他潜在问题。' },
  },
];
