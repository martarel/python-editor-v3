/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import lunr from "lunr";
import { blocksToText } from "./blocks-to-text";
import type {
  ApiDocsEntry,
  ApiDocsResponse,
} from "../../language-server/apidocs";
import type { Toolkit, ToolkitTopic } from "../explore/model";
import {
  Extracts,
  IndexMessage,
  QueryMessage,
  Result,
  SearchResults,
} from "./common";
import { contextExtracts, fullStringExtracts, Position } from "./extracts";

import stemmerSupport from "lunr-languages/lunr.stemmer.support";
stemmerSupport(lunr);

const ignoredPythonStopWords = new Set([
  // Sorted.
  "and",
  "else",
  "for",
  "if",
  "not",
  "or",
  "while",
]);
const originalStopWordFilter = lunr.stopWordFilter;
lunr.stopWordFilter = (token) => {
  if (ignoredPythonStopWords.has(token.toString())) {
    return token;
  }
  return originalStopWordFilter(token);
};
lunr.Pipeline.registerFunction(lunr.stopWordFilter, "pythonStopWordFilter");

interface Metadata {
  [match: string]: MatchMetadata;
}
interface MatchMetadata {
  [field: string]: { position: Position[] };
}

export class SearchIndex {
  constructor(
    private contentByRef: Map<string, SearchableContent>,
    public index: lunr.Index,
    private tab: "explore" | "reference"
  ) {}

  search(text: string): Result[] {
    const results = this.index.search(
      // TODO: Review escaping and decide what we let through.
      //       Ideally nothing that can cause query errors.
      text.replace(/[~^+:-]/g, (x) => `\\$1`)
    );
    return results.map((result) => {
      const content = this.contentByRef.get(result.ref);
      if (!content) {
        throw new Error("Missing content");
      }
      // eslint-disable-next-line
      const matchMetadata = result.matchData.metadata as Metadata;
      const extracts = getExtracts(matchMetadata, content);
      return {
        id: content.id,
        title: content.title,
        containerTitle: content.containerTitle,
        navigation: {
          tab: this.tab,
          [this.tab]: { id: content.id },
        },
        extract: extracts,
      };
    });
  }
}

const getExtracts = (
  matchMetadata: Metadata,
  content: SearchableContent
): Extracts => {
  const allContentPositions: Position[] = [];
  const allTitlePositions: Position[] = [];

  for (const match of Object.values(matchMetadata)) {
    if (match.title) {
      match.title.position.forEach((p) => {
        allTitlePositions.push(p);
      });
    }
    if (match.content) {
      match.content.position.forEach((p) => {
        allContentPositions.push(p);
      });
    }
  }

  return {
    title: fullStringExtracts(allTitlePositions, content.title),
    // TODO: consider a fallback if only text in the title is matched.
    content: contextExtracts(allContentPositions, content.content),
  };
};

export class LunrSearch {
  constructor(private explore: SearchIndex, private reference: SearchIndex) {}

  search(text: string): SearchResults {
    return {
      explore: this.explore.search(text),
      reference: this.reference.search(text),
    };
  }
}

export interface SearchableContent {
  id: string;
  /**
   * The Reference module or Explore topic.
   */
  containerTitle: string;
  title: string;
  content: string;
}

const defaultString = (string: string | undefined): string => {
  return string || "";
};

const exploreSearchableContent = (toolkit: Toolkit): SearchableContent[] => {
  const content: SearchableContent[] = [];
  toolkit.contents?.forEach((t) => {
    if (!isSingletonTopic(t)) {
      content.push({
        id: t.slug.current,
        title: t.name,
        containerTitle: t.name,
        content: t.subtitle + ".\n\n" + blocksToText(t.introduction),
      });
    }
    t.contents?.forEach((e) => {
      const contentString = blocksToText(e.content);
      const detailContentString = blocksToText(e.detailContent);
      const alternativesLabel = "\n\n" + defaultString(e.alternativesLabel);
      const alternatives =
        "\n\n" + defaultString(e.alternatives?.map((a) => a.name).join(" "));
      content.push({
        id: e.slug.current,
        title: e.name,
        containerTitle: t.name,
        content:
          contentString +
          alternativesLabel +
          alternatives +
          detailContentString,
      });
    });
  });
  return content;
};

const referenceSearchableContent = (
  toolkit: ApiDocsResponse
): SearchableContent[] => {
  const content: SearchableContent[] = [];
  const addNestedDocs = (
    moduleName: string,
    entries: ApiDocsEntry[] | undefined
  ): void => {
    entries?.forEach((c) => {
      content.push({
        id: c.id,
        title: c.fullName.substring(moduleName.length + 1),
        containerTitle: moduleName,
        content: defaultString(c.docString),
      });
      addNestedDocs(moduleName, c.children);
    });
  };
  for (const module of Object.values(toolkit)) {
    content.push({
      id: module.id,
      title: module.fullName,
      containerTitle: module.fullName,
      content: defaultString(module.docString),
    });
    addNestedDocs(module.fullName, module.children);
  }
  return content;
};

export const buildSearchIndex = (
  searchableContent: SearchableContent[],
  tab: "explore" | "reference",
  ...plugins: lunr.Builder.Plugin[]
): SearchIndex => {
  const index = lunr(function () {
    this.ref("id");
    this.field("title", { boost: 10 });
    this.field("content");
    plugins.forEach((p) => this.use(p));
    this.metadataWhitelist = ["position"];
    for (const doc of searchableContent) {
      this.add(doc);
    }
  });
  const contentByRef = new Map(searchableContent.map((c) => [c.id, c]));
  return new SearchIndex(contentByRef, index, tab);
};

// Exposed for testing.
export const buildToolkitIndex = async (
  exploreToolkit: Toolkit,
  referenceToolkit: ApiDocsResponse
): Promise<LunrSearch> => {
  const language = exploreToolkit.language;
  const languageSupport = await loadLunrLanguageSupport(language);
  const plugins: lunr.Builder.Plugin[] = [];
  if (languageSupport) {
    // Loading plugin for fr makes lunr.fr available but we don't model this in the types.
    // Avoid repeatedly initializing them when switching back and forth.
    if (!(lunr as any)[language]) {
      languageSupport(lunr);
    }
    plugins.push((lunr as any)[language]);
  }

  return new LunrSearch(
    buildSearchIndex(
      exploreSearchableContent(exploreToolkit),
      "explore",
      ...plugins
    ),
    buildSearchIndex(referenceSearchableContent(referenceToolkit), "reference")
  );
};

async function loadLunrLanguageSupport(
  language: string
): Promise<undefined | ((l: typeof lunr) => void)> {
  // Enumerated for code splitting.
  switch (language) {
    case "fr":
      return (await import("lunr-languages/lunr.fr")).default;
    default:
      // No search support for the language, default to lunr's built-in English support.
      return undefined;
  }
}

export class SearchWorker {
  private search: LunrSearch | undefined;
  // We block queries on indexing.
  private recordInitialization: (() => void) | undefined;
  private initialized: Promise<void>;

  constructor(private ctx: Worker) {
    // We return Promises here just to allow for easy testing.
    this.ctx.onmessage = async (event: MessageEvent) => {
      const data = event.data;
      if (data.kind === "query") {
        return this.query(data as QueryMessage);
      } else if (data.kind === "index") {
        return this.index(data as IndexMessage);
      } else {
        console.error("Unexpected worker message", event);
      }
    };
    this.initialized = new Promise((resolve) => {
      // Later, in response to the index message.
      this.recordInitialization = resolve;
    });
  }

  private async index(message: IndexMessage) {
    this.search = await buildToolkitIndex(message.explore, message.reference);
    this.recordInitialization!();
  }

  private async query(message: QueryMessage) {
    const search = await this.initializedIndex();
    this.ctx.postMessage({
      kind: "queryResponse",
      ...search.search(message.query),
    });
  }

  private async initializedIndex(): Promise<LunrSearch> {
    await this.initialized;
    return this.search!;
  }
}

// We have some topics that contain a single item with the same id.
// There's no sense indexing the topic itself in those cases.
const isSingletonTopic = (t: ToolkitTopic): boolean =>
  t.contents?.length === 1 && t.contents[0].slug.current === t.slug.current;