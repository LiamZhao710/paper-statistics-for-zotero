/** Runtime implementation is dependency-free JavaScript; these describe persisted data. */
export interface TextStatistics {
  words: number | null;
  textCompleteness: "complete" | "partial" | "unknown";
  indexedPages?: number;
  totalPages?: number | null;
}
export interface CachedPaperStatistics extends TextStatistics {
  attachmentID: number;
  attachmentKey: string;
  libraryID: number;
  pages: number | null;
  figures: number | null;
  tables: number | null;
  references: number | null;
  statements: number | null;
  algorithms: number | null;
  equations: number | null;
  statementIDs: string[];
  statementCounts: { proposition: number; theorem: number; lemma: number; corollary: number } | null;
  algorithmIDs: string[];
  equationIDs: string[];
  equationScope: string;
  figureIDs: string[];
  tableIDs: string[];
  fileMTime: number;
  fileSize: number;
  algorithmVersion: number;
  settingsKey: string;
  calculatedAt: number;
  source: string;
  warning: string | null;
}
