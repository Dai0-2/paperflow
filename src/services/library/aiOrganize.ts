import { z } from 'zod';
import type { PaperInfo } from '../../types';

const proposalSchema = z.object({
  existingCollectionIds: z.array(z.string()).default([]),
  suggestedTags: z.array(z.string().min(1).max(64)).max(12).default([]),
  suggestedCollection: z.string().min(1).max(100).optional(),
  reason: z.string().min(1).max(500),
});

export type AiOrganizeProposal = z.infer<typeof proposalSchema>;

export interface AiOrganizeInput {
  paper: PaperInfo;
  existingTags: string[];
  collections: Array<{ id: string; name: string }>;
}

export interface AiOrganizeRequest {
  question: string;
  context: string;
}

export function buildAiOrganizeRequest(input: AiOrganizeInput): AiOrganizeRequest {
  const metadata = {
    title: input.paper.title,
    authors: input.paper.authors || null,
    abstract: input.paper.abstract || null,
    existingTags: input.existingTags,
    availableCollections: input.collections,
  };
  return {
    question: [
      'Organize this academic reference.',
      'Return only JSON with keys: existingCollectionIds, suggestedTags, suggestedCollection, reason.',
      'Use only collection IDs from availableCollections. Keep the reason brief.',
    ].join(' '),
    context: JSON.stringify(metadata),
  };
}

function jsonPayload(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fenced?.[1] || raw).trim()) as unknown;
}

export function parseAiOrganizeProposal(raw: string, allowedCollectionIds: Set<string>): AiOrganizeProposal {
  const parsed = proposalSchema.parse(jsonPayload(raw));
  return {
    ...parsed,
    existingCollectionIds: parsed.existingCollectionIds.filter((id) => allowedCollectionIds.has(id)),
    suggestedTags: [...new Set(parsed.suggestedTags.map((tag) => tag.trim()).filter(Boolean))],
    suggestedCollection: parsed.suggestedCollection?.trim() || undefined,
  };
}
