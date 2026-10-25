import { StoryRun } from './story-run.js';
import { StoryChapterRun } from './story-chapter-run.js';
import { getStoryChapter } from './story-chapters.js';

// Each chapter owns a fresh attempt while sharing the existing game loop,
// world geometry, dialogue UI and chapter-completion archive.
export function createStoryRun(game,{id='prologue'}={}){
  if(!getStoryChapter(id))throw new RangeError(`Unknown story: ${id}`);
  return id==='prologue'?new StoryRun(game,{id}):new StoryChapterRun(game,{id});
}
