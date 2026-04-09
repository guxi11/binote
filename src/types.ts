export type RoamConfig = {
  readonly projectRoot: string;
  readonly roamDir: string;
  readonly notesDir: string;
  readonly indexPath: string;
  readonly ignore: readonly string[];
};

export type NoteKind = "file" | "directory" | "standalone";

export type LinkIndex = {
  readonly forward: Record<string, readonly string[]>;
  readonly reverse: Record<string, readonly string[]>;
};

export type SyncResult = {
  readonly deleted: readonly string[];
  readonly orphaned: readonly string[];
  readonly linksUpdated: number;
};

export type SearchHit = {
  readonly notePath: string;
  readonly lineNumber: number;
  readonly lineContent: string;
  readonly context: string;
};
