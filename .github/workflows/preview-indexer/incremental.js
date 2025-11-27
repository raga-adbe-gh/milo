import PQueue from 'p-queue';
import { getLingoConfigMap } from './internal/utils.js';
import { initIndexer } from './internal/indexer.js';

// Add delay of 90 seconds before processing begins
await new Promise(resolve => setTimeout(resolve, 360 * 1000));

const ORG = 'adobecom';

const { env } = process;
const {
  PREVIEW_INDEXER_REPOS,
  SITE,
} = env;

const reposToProcess = PREVIEW_INDEXER_REPOS.split(',').map((path) => path.trim()).filter(Boolean);
const lingoConfigMap = await getLingoConfigMap();

const queue = new PQueue({ concurrency: Number(process.env.PREVIEW_INDEXER_CONCURRENCY || '1') });
const filteredRepos = reposToProcess.filter((repo) => !SITE || repo === SITE);

for (const repo of filteredRepos) {
  await queue.add(async () => {
    console.log(`Initiating incremental index for ${ORG}/${repo}`);
    const indexer = await initIndexer(ORG, repo, lingoConfigMap);
    return indexer.incremental();
  });
}

await queue.onIdle();

console.log('All repos processed');
