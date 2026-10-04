import { IntroClient } from './intro-client';
import { INTRO_ID, INTRO_SESSION_KEY } from './constants';

/**
 * First-visit intro (once per browser session). The overlay is server-rendered but inert; a tiny script that runs
 * before first paint activates it only when the session has not seen it, so returning visitors never see a flash and
 * first-time visitors never see the page behind it. Off for reduced motion and deep links (`/#modules`). If
 * JavaScript never hydrates, a CSS fail-safe fades it out after 9 s.
 */
export function Intro() {
  const gate =
    `(function(){try{if(sessionStorage.getItem(${JSON.stringify(INTRO_SESSION_KEY)})||location.hash||` +
    `matchMedia('(prefers-reduced-motion: reduce)').matches)return;` +
    `var e=document.getElementById(${JSON.stringify(INTRO_ID)});if(e)e.setAttribute('data-active','');}catch(_){}})();`;
  return (
    <>
      <style>{`
        #${INTRO_ID}{display:none}
        #${INTRO_ID}[data-active]{display:block}
        #${INTRO_ID}.hs-failsafe[data-active]{animation:hs-failsafe .6s ease 9s forwards}
        @keyframes hs-failsafe{to{opacity:0;visibility:hidden}}
      `}</style>
      <div id={INTRO_ID} className="hs-failsafe fixed inset-0 z-[100]" suppressHydrationWarning>
        <IntroClient failsafeClass="hs-failsafe" />
      </div>
      <script dangerouslySetInnerHTML={{ __html: gate }} />
    </>
  );
}
