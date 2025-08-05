import { decorateAnchorVideo } from '../../utils/decorate.js';
import { createTag, getConfig, getFederatedContentRoot } from '../../utils/utils.js';

let captionsLangMap = null;
let captionsLangMapPromise = null;

const logError = (msg, error) => window.lana.log(`${msg}: ${error}`);

const updateCaptionsLang = (url, geo, captionsLangMap) => {

  if (geo && captionsLangMap) {
    const entry = captionsLangMap.find((l) => l?.geos?.split(',')?.includes(geo));
    if (entry) {
      const captionParam = entry.captions === 'eng' ? entry.captions : `${entry.captions},eng`;
      url.searchParams.set('captions', captionParam);
    }
  }

  return url.toString();
};

const createIframe = (a, href) => {
  const videoHref = href || a.href;

  const iframe = createTag('iframe', {
    src: videoHref,
    class: 'adobetv',
    scrolling: 'no',
    allow: 'encrypted-media; fullscreen',
    title: 'Adobe Video Publishing Cloud Player',
    loading: 'lazy',
  });
  const embed = createTag('div', { class: 'milo-video' }, iframe);
  a.insertAdjacentElement('afterend', embed);

  const idMatch = videoHref.match(/\/v\/(\d+)/);
  const videoId = idMatch ? idMatch[1] : null;

  if (videoId) {
    window.fetch(`https://video.tv.adobe.com/v/${videoId}?format=json-ld`)
      .then((res) => res.json())
      .then(async (info) => {
        const { setDialogAndElementAttributes } = await import('../../scripts/accessibility.js');
        setDialogAndElementAttributes({ element: iframe, title: `${info?.jsonLinkedData?.name}` });
      });
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== 'https://video.tv.adobe.com' || !event.data) return;
    const { state, id } = event.data;
    if (!['play', 'pause'].includes(state)
      || !Number.isInteger(id)
      || !iframe.src.startsWith(`${event.origin}/v/${id}`)) return;

    iframe.setAttribute('data-playing', state === 'play');
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting && target.getAttribute('data-playing') === 'true') {
        target.contentWindow?.postMessage({ type: 'mpcAction', action: 'pause' }, target.src);
      }
    });
  }, { rootMargin: '0px' });
  io.observe(iframe);

  a.remove();
}

const createIframeWithCaptions = (a, url, geo, captionsLangMapPromise) => {
  captionsLangMapPromise.then((resp) => {
    if (resp?.data) {
      captionsLangMap = resp.data;
      const videoHref = updateCaptionsLang(url, geo, captionsLangMap);
      createIframe(a, videoHref);
      return;
    }
    createIframe(a);
  }).catch((e) => {
    logError(`Could not get atv captions`, e);
    createIframe(a);
  });
}

export default function init(a) {
  a.classList.add('hide-video');
  const bgBlocks = ['aside', 'marquee', 'hero-marquee', 'long-form'];
  if (a.href.includes('.mp4') && bgBlocks.some((b) => a.closest(`.${b}`))) {
    a.classList.add('hide');
    if (!a.parentNode) return;
    decorateAnchorVideo({
      src: a.href,
      anchorTag: a,
    });
  } else {
    const url = new URL(a.href);
    const { captionsKey, locale } = getConfig();
    const federalCR = captionsKey && getFederatedContentRoot();
    const geo = (locale?.prefix || '').replace('/', '');

    if (federalCR && url.searchParams.has('captions')) {
      if (captionsLangMapPromise) {
        return createIframeWithCaptions(a, url, geo, captionsLangMapPromise);
      }
      const captionsUrl = `https://${getFederatedContentRoot()}/federal/assets/data/adobetv-captions.json?sheet=${captionsKey}`;
      captionsLangMapPromise = fetch(captionsUrl).then(async (res) => {
        if (!res.ok) {
          return new Promise(() => { throw new Error(`Failed to fetch ${captionsUrl}`); });
        }
        return res.json();
      });
      createIframeWithCaptions(a, url, geo, captionsLangMapPromise);
    } else {
      createIframe(a);
    }
  }
}
