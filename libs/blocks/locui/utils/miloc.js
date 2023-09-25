import { allowFindFragments, allowSendForLoc, allowSyncToLangstore, heading, languages, projectStatus } from './state.js';
import { getItemId } from '../../../tools/sharepoint/shared.js';
import updateExcelTable from '../../../tools/sharepoint/excel.js';
import { origin, preview } from './franklin.js';
import { setExcelStatus, setStatus } from './status.js';
import getServiceConfig from '../../../utils/service-config.js';
import '../../../deps/md5.min.js';

const INTERVAL = 3000;
const MAX_COUNT = 1200; // 3000 x 1200 = 3600000s = 1 hour

async function getMilocUrl() {
  const env = heading.value.env || null;
  const { miloc } = await getServiceConfig(origin, env);
  return miloc.url;
}

function handleProjectStatusDetail(detail) {
  languages.value = [...languages.value.map((lang) => ({ ...lang, ...detail[lang.code] }))];
}

export async function getProjectStatus() {
  const url = await getMilocUrl();
  const resp = await fetch(`${url}project-status?project=${heading.value.projectId}`);
  const json = await resp.json();

  if (json.projectStatus === 'sync' || json.projectStatus === 'download') {
    setStatus('service', 'info', json.projectStatusText);
  }

  if (json.projectStatus === 'sync-done') {
    setStatus('service');
    allowSyncToLangstore.value = true;
    allowSendForLoc.value = true;
  }

  if (json.projectStatus === 'waiting') {
    setStatus('service');
    allowSyncToLangstore.value = false;
    allowSendForLoc.value = false;
  }

  handleProjectStatusDetail(json);
  return json;
}

export async function startSync() {
  setStatus('service', 'info', 'Syncing documents to Langstore.');
  const url = await getMilocUrl();
  setExcelStatus('Sync to langstore/en.', '');
  const opts = { method: 'POST' };
  const resp = await fetch(`${url}start-sync?project=${heading.value.projectId}`, opts);
  return resp.status;
}

export async function startProject() {
  const url = await getMilocUrl();
  setStatus('service', 'info', 'Sending to translation service.');
  const opts = { method: 'POST' };
  const resp = await fetch(`${url}start-project?project=${heading.value.projectId}`, opts);
  if (resp.status === 201) setExcelStatus('Sent to localization service.', '');
  return resp.status;
}

export async function rolloutLang(languageCode, reroll = false) {
  setExcelStatus('Rolling out.', `Lang: ${languageCode} - Reroll: ${reroll ? 'yes' : 'no'}`);
  const url = await getMilocUrl();
  const opts = { method: 'POST' };
  const resp = await fetch(`${url}start-rollout?project=${heading.value.projectId}&languageCode=${languageCode}&reroll=${reroll}`, opts);
  return resp.json();
}

export async function createProject() {
  const url = await getMilocUrl();
  setStatus('service', 'info', 'Creating new project.');
  setExcelStatus('Creating new project.', '');
  const path = heading.value.path.replace('.page', '.live');
  const body = `${origin}${path}.json`;
  const opts = { method: 'POST', body };
  const resp = await fetch(`${url}create-project`, opts);
  if (resp.status === 201) {
    allowFindFragments.value = false;
    const projectId = window.md5(body);
    heading.value = { ...heading.value, projectId };
    const values = [['Project ID', projectId]];
    const itemId = getItemId();
    await updateExcelTable({ itemId, tablename: 'settings', values });
    preview(`${heading.value.path}.json`);
    return startSync(url);
  }
  return resp.status;
}

export async function getServiceUpdates() {
  const url = await getMilocUrl();
  let count = 1;
  const excelUpdated = setInterval(async () => {
    projectStatus.value = await getProjectStatus(url);
    count += 1;
    // Stop syncing after an hour
    if (count > MAX_COUNT) {
      setStatus(
        'service',
        'info',
        'Sync stopped after 1 hour.',
        'Please refresh the page if you wish to see the latest updates on your project',
      );
      clearInterval(excelUpdated);
    }
  }, INTERVAL);
  return getProjectStatus(url);
}
