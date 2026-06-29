"use client";

import Script from "next/script";
import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";
import { META_PIXEL_ID } from "@/lib/constants";

const MIXPANEL_TOKEN = "b39d7d89c68e7ebf1d5ff67d396f4802";

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // 메타 광고 인입 식별: ?fbclid=... 또는 utm_source=facebook/instagram/meta.
  // 광고로 판정되면 utm_campaign 도 같이 저장하여 카카오 CTA 의 extra 에 광고별 식별자를 부착한다.
  // 세션 내내 유지되며 페이지 내 어떤 CTA 를 눌러도 동일 분기.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fbclid = params.get("fbclid");
      const utmSource = params.get("utm_source")?.toLowerCase();
      const isMetaAd =
        !!fbclid ||
        (!!utmSource && ["facebook", "instagram", "meta"].includes(utmSource));
      if (isMetaAd) {
        sessionStorage.setItem("spot_inflow_source", "meta_ad");
        // utm_campaign 정규화: 영숫자/언더스코어/하이픈만, 최대 30자.
        // 잘못된 값이 카카오 콘솔의 extra 매칭을 깨뜨리지 않도록 sanitize.
        // utm_campaign 없는 재유입에서 이전 캠페인 값이 남아 오분류되지 않도록
        // 명시적으로 removeItem 처리한다 (광고만 있고 캠페인 미지정은 web_ad fallback).
        const rawCampaign = params.get("utm_campaign");
        const campaign = rawCampaign
          ? rawCampaign.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30)
          : "";
        if (campaign) {
          sessionStorage.setItem("spot_inflow_campaign", campaign);
        } else {
          sessionStorage.removeItem("spot_inflow_campaign");
        }
      }
    } catch { /* sessionStorage 차단 환경 무시 */ }
  }, []);

  // Page view
  useEffect(() => {
    if (pathname === "/") track("[ROUTE] SpotHomeScreen");
  }, [pathname]);

  // Scroll depth tracking
  useEffect(() => {
    const thresholds = [25, 50, 75, 100] as const;
    const fired = new Set<number>();

    const handle = () => {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollableHeight <= 0) return;
      const pct = Math.round((window.scrollY / scrollableHeight) * 100);
      for (const t of thresholds) {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          track("[VIEW] SpotScrollDepth", { depth: t });
        }
      }
    };

    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, [pathname]);

  return (
    <>
      {/* Mixpanel */}
      <Script id="mixpanel" strategy="afterInteractive">
        {`(function(f,b){if(!b.__SV){var e,g,i,h;window.mixpanel=b;b._i=[];b.init=function(e,f,c){function g(a,d){var b=d.split(".");2==b.length&&(a=a[b[0]],d=b[1]);a[d]=function(){a.push([d].concat(Array.prototype.slice.call(arguments,0)))}}var a=b;"undefined"!==typeof c?a=b[c]=[]:c="mixpanel";a.people=a.people||[];a.toString=function(a){var d="mixpanel";"mixpanel"!==c&&(d+="."+c);a||(d+=" (stub)");return d};a.people.toString=function(){return a.toString(1)+".people (stub)"};i="disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" ");for(h=0;h<i.length;h++)g(a,i[h]);var j="set set_once union unset remove delete".split(" ");a.get_group=function(){function b(c){d[c]=function(){call2_args=arguments;call2=[c].concat(Array.prototype.slice.call(call2_args,0));a.push([e,call2])}}for(var d={},e=["get_group"].concat(Array.prototype.slice.call(arguments,0)),c=0;c<j.length;c++)b(j[c]);return d};b._i.push([e,f,c])};b.__SV=1.2;e=f.createElement("script");e.type="text/javascript";e.async=!0;e.src="undefined"!==typeof MIXPANEL_CUSTOM_LIB_URL?MIXPANEL_CUSTOM_LIB_URL:"file:"===f.location.protocol&&"//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\\/\\//)?"https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js":"//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js";g=f.getElementsByTagName("script")[0];g.parentNode.insertBefore(e,g)}})(document,window.mixpanel||[]);mixpanel.init('${MIXPANEL_TOKEN}',{track_pageview:false});`}
      </Script>

      {/* Meta Pixel init 은 SSR HTML 에 조기 임베드 위해 app/layout.tsx <head> 로 이동.
          여기에는 noscript fallback 만 유지. */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>

      {/* Naver CTS 는 SSR HTML 에 직접 박혀야 검수 봇이 정적 파싱으로 인식하므로
          app/layout.tsx 의 <head> 에 raw <script> 태그로 설치한다. */}

      {children}
    </>
  );
}
