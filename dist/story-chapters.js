import { getConfigSection } from './content-config.js';

// Selection and runtime use the same validated, remotely publishable catalog.
export const STORY_CHAPTERS=getConfigSection('story').definitions;
export const getStoryChapter=id=>STORY_CHAPTERS.find(chapter=>chapter.id===id)||null;
