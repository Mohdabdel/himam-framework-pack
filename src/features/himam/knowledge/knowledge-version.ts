import { loadKnowledgeManifest } from "./knowledge-loader";

export function getKnowledgePackageVersion(): string {
  return loadKnowledgeManifest().version;
}